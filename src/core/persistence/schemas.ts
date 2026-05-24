import { RxJsonSchema } from 'rxdb'

export const PROJECT_SCHEMA: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:        { type: 'string', maxLength: 100 },
    name:      { type: 'string' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    settings: {
      type: 'object',
      properties: {
        units:            { type: 'object' },
        facetres:         { type: 'number' },
        dimtoh:           { type: 'boolean' },
        dimtad:           { type: 'boolean' },
        currentLayer:     { type: 'string' },
        currentElevation: { type: 'number' },
        currentThickness: { type: 'number' },
        idCounters:       { type: 'object' },
        constraints:      { type: 'array' }
      }
    }
  },
  required: ['id', 'name', 'createdAt', 'updatedAt', 'settings']
}

export const ENTITY_SCHEMA: RxJsonSchema<any> = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:             { type: 'string', maxLength: 100 },
    projectId:      { type: 'string', maxLength: 100 },
    type:           { type: 'string' },
    layer:          { type: 'string' },
    elevation:      { type: 'number' },
    thickness:      { type: 'number' },
    data:           { type: 'string' },        // JSON — entity-specific fields
    properties:     { type: 'string' },        // JSON — Entity.properties bag
    creationParams: { type: 'string' },        // JSON — Solid3D.creationParams or ''
    updatedAt:      { type: 'number' }
  },
  required: ['id', 'projectId', 'type', 'data', 'updatedAt'],
  indexes: ['projectId', ['projectId', 'updatedAt']]
}

export const LAYER_SCHEMA: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',                             // composite: `${projectId}::${name}`
  type: 'object',
  properties: {
    id:         { type: 'string', maxLength: 200 },
    projectId:  { type: 'string', maxLength: 100 },
    name:       { type: 'string' },
    color:      { type: 'number' },
    linetype:   { type: 'string' },
    lineWeight: { type: 'number' },
    isVisible:  { type: 'boolean' },
    isFrozen:   { type: 'boolean' },
    isLocked:   { type: 'boolean' }
  },
  required: ['id', 'projectId', 'name'],
  indexes: ['projectId']
}

export const BREP_SCHEMA: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:         { type: 'string', maxLength: 200 },
    projectId:  { type: 'string', maxLength: 100 },
    entityId:   { type: 'string', maxLength: 100 },
    data:       { type: 'string' }
  },
  required: ['id', 'projectId', 'entityId', 'data'],
  indexes: ['projectId']
}
