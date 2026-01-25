import * as THREE from 'three';
import * as OBC from '@thatopen/components';

export class BIMViewer {
  private components: OBC.Components;
  private world: OBC.World;
  private scene: OBC.SimpleScene;
  private camera: OBC.OrthoPerspectiveCamera;
  private renderer: OBC.SimpleRenderer;

  constructor(container: HTMLElement) {
    this.components = new OBC.Components();
    this.world = this.components.get(OBC.Worlds).create();
    this.scene = this.world.getScene();
    this.camera = this.world.getCamera();
    this.renderer = this.world.getRenderer();
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);
  }

  async init() {
    await this.components.init();
  }

  getComponents() {
    return this.components;
  }

  getIfcLoader() {
    return this.components.get(OBC.IfcLoader);
  }
}
