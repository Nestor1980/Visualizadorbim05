#!/usr/bin/env python3
"""Deploy de Visualizadorbim05 al servidor via SSH.

1. Copia (rsync, espejo exacto) los archivos del proyecto local al servidor,
   directo a /opt/app-visualizador-bim (la carpeta que sirve nginx segun
   /etc/nginx/sites-enabled/app-visualizador-bim: root .../dist).
2. En el servidor: npm install, npm run build:prod.
3. (Opcional, best-effort) sudo systemctl reload nginx.

La contrasena de SSH se pide una sola vez: se abre una conexion maestra
(ssh ControlMaster) que rsync y el comando remoto reutilizan, en vez de
guardar la contrasena en una variable de Python. Es mas seguro (el texto
plano nunca pasa por el script) y logra el mismo resultado: un solo prompt.

El reload de nginx NO es necesario para que los archivos nuevos se sirvan
(nginx lee los estaticos del disco en cada request, no los cachea) — solo
hace falta si cambio la config de nginx. Por eso su fallo (por ejemplo si
sudo pide una contrasena distinta a la de SSH y no la tenes) no aborta el
deploy: se avisa como advertencia, no como error.

Uso:
    python3 scripts/deploy.py
    python3 scripts/deploy.py --host 192.168.100.15 --user atapari --path /opt/app-visualizador-bim
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_HOST = "192.168.100.15"
DEFAULT_USER = "atapari"
DEFAULT_REMOTE_PATH = "/opt/app-visualizador-bim"

LOCAL_ROOT = Path(__file__).resolve().parent.parent

RSYNC_EXCLUDES = [
    "node_modules",
    ".git",
    "dist",
    ".vite",
]

BUILD_STEPS = [
    "npm install",
    "npm run build:prod",
]

NGINX_RELOAD_CMD = "sudo systemctl reload nginx"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--path", default=DEFAULT_REMOTE_PATH, help="Ruta del proyecto en el servidor")
    parser.add_argument(
        "--skip-nginx",
        action="store_true",
        help="No recargar nginx al final (por ejemplo si el usuario no tiene sudo)",
    )
    return parser.parse_args()


def start_master(user: str, host: str, control_path: str) -> int:
    print("Autenticando (la contrasena se pide una sola vez) ...")
    cmd = [
        "ssh", "-MNf",
        "-o", "ControlMaster=auto",
        "-o", f"ControlPath={control_path}",
        "-o", "ControlPersist=120",
        f"{user}@{host}",
    ]
    return subprocess.run(cmd).returncode


def stop_master(user: str, host: str, control_path: str) -> None:
    subprocess.run(
        ["ssh", "-O", "exit", "-o", f"ControlPath={control_path}", f"{user}@{host}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def rsync_files(user: str, host: str, remote_path: str, control_path: str) -> int:
    destination = f"{user}@{host}:{remote_path}/"
    cmd = ["rsync", "-avz", "--delete", "-e", f"ssh -o ControlPath={control_path}"]
    for pattern in RSYNC_EXCLUDES:
        cmd += ["--exclude", pattern]
    cmd += [f"{LOCAL_ROOT}/", destination]

    print("Copiando archivos (espejo exacto):")
    print(f"  {' '.join(cmd)}\n")
    return subprocess.run(cmd).returncode


def ssh_run(user: str, host: str, control_path: str, remote_command: str) -> int:
    print("Comando remoto:")
    print(f"  {remote_command}\n")

    # -t: fuerza pseudo-terminal para que sudo pueda pedir su contrasena
    # (si hace falta) y para ver el output en vivo.
    cmd = ["ssh", "-t", "-o", f"ControlPath={control_path}", f"{user}@{host}", remote_command]
    return subprocess.run(cmd).returncode


def build_remote(user: str, host: str, remote_path: str, control_path: str) -> int:
    remote_command = f"cd {remote_path} && " + " && ".join(BUILD_STEPS)
    return ssh_run(user, host, control_path, remote_command)


def reload_nginx(user: str, host: str, control_path: str) -> int:
    return ssh_run(user, host, control_path, NGINX_RELOAD_CMD)


def main() -> int:
    args = parse_args()

    tmp_dir = tempfile.mkdtemp(prefix="deploy-ssh-")
    control_path = os.path.join(tmp_dir, "control")

    print(f"Conectando a {args.user}@{args.host} ...")
    if start_master(args.user, args.host, control_path) != 0:
        print("No se pudo autenticar por SSH.", file=sys.stderr)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return 1

    try:
        rsync_status = rsync_files(args.user, args.host, args.path, control_path)
        if rsync_status != 0:
            print(f"\nFallo la copia de archivos (exit code {rsync_status}).", file=sys.stderr)
            return rsync_status

        build_status = build_remote(args.user, args.host, args.path, control_path)
        if build_status != 0:
            print(f"\nFallo el build en el servidor (exit code {build_status}).", file=sys.stderr)
            return build_status

        if not args.skip_nginx:
            nginx_status = reload_nginx(args.user, args.host, control_path)
            if nginx_status != 0:
                print(
                    "\nAdvertencia: no se pudo recargar nginx "
                    f"(exit code {nginx_status}). No es necesario para servir "
                    "los archivos nuevos, solo si cambio la config de nginx.",
                    file=sys.stderr,
                )

        print("\nDeploy completado: archivos copiados y build generado en el servidor.")
        return 0
    finally:
        stop_master(args.user, args.host, control_path)
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
