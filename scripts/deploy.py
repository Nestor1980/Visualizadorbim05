#!/usr/bin/env python3
"""Deploy de Visualizadorbim05 al servidor de produccion via SSH.

Reproduce los pasos documentados en DEPLOY.md:
    git pull
    npm install
    npm run build:prod
    sudo systemctl reload nginx

No guarda ni transmite la contrasena: usa el prompt interactivo normal de
`ssh`/`sudo` en la terminal (igual que al hacer `ssh usuario@host` a mano).

Uso:
    python3 scripts/deploy.py
    python3 scripts/deploy.py --host 192.168.100.15 --user atapari --path /opt/app-visualizador-bim
"""

import argparse
import subprocess
import sys

DEFAULT_HOST = "192.168.100.15"
DEFAULT_USER = "atapari"
DEFAULT_REMOTE_PATH = "/opt/app-visualizador-bim"

REMOTE_STEPS = [
    "git pull",
    "npm install",
    "npm run build:prod",
    "sudo systemctl reload nginx",
]


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


def build_remote_command(remote_path: str, skip_nginx: bool) -> str:
    steps = REMOTE_STEPS[:-1] if skip_nginx else REMOTE_STEPS
    return f"cd {remote_path} && " + " && ".join(steps)


def main() -> int:
    args = parse_args()
    remote_command = build_remote_command(args.path, args.skip_nginx)

    print(f"Conectando a {args.user}@{args.host} ...")
    print("Comando remoto:")
    print(f"  {remote_command}\n")

    # -t: fuerza pseudo-terminal para que ssh y sudo puedan pedir la
    # contrasena de forma interactiva y para ver el output en vivo.
    result = subprocess.run(["ssh", "-t", f"{args.user}@{args.host}", remote_command])

    if result.returncode != 0:
        print(f"\nEl deploy termino con errores (exit code {result.returncode}).", file=sys.stderr)
    else:
        print("\nDeploy completado.")

    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
