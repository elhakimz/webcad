import { Document } from "../../model/Document";
import { Viewer } from "../../../render/Viewer";
import { CommandManager } from "../CommandManager";
import { Entity } from "../../model/Entity";
import { Layer } from "../../model/Layer";
import { CommandAction, CommandResponse } from "../../commands/types";

export interface AppContext {
  doc: Document;
  viewer: Viewer;
  cmd: CommandManager;
  selectedEntityIds: Set<string>;
  addEntity(entity: Entity, recordHistory?: boolean, useCurrentLayer?: boolean): void;
  syncFromDocument(): void;
  updateLayerVisibility(): void;
  terminateActiveCommand(): void;
  onStatusBarUpdate(layer: Layer): void;
}

export interface ActionHandler {
  canHandle(action: CommandAction): boolean;
  handle(action: CommandAction, context: AppContext): CommandResponse | undefined;
}
