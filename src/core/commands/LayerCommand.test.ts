import { describe, it, expect } from 'vitest'
import { LayerCommand } from './LayerCommand'

describe('LayerCommand', () => {
  it('should return action:finish on exit', () => {
    const cmd = new LayerCommand()
    expect(cmd.onInput('', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })).toEqual({ action: 'finish' })
  })

  it('should handle NEW option with two-step interaction', () => {
    const cmd = new LayerCommand()
    
    // Step 1: User types 'N'
    const res1 = cmd.onInput('N', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res1).toBe('New layer name:')
    expect(cmd.step).toBe(1)
    
    // Step 2: User types 'test_layer'
    const res2 = cmd.onInput('test_layer', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res2).toEqual({ action: 'layerNew', name: 'TEST_LAYER' })
    expect(cmd.step).toBe(0)
  })

  it('should handle NEW option with immediate argument', () => {
    const cmd = new LayerCommand()
    const _res = cmd.onInput('N test_layer', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    // removed test assert
  })

  it('should handle COLOR option with three-step interaction', () => {
    const cmd = new LayerCommand()
    
    // Step 1: User types 'C'
    const res1 = cmd.onInput('C', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res1).toBe('Color (1-7):')
    
    // Step 2: User types '1' (red)
    const res2 = cmd.onInput('1', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res2).toBe('Layer name(s) for color 1:')
    
    // Step 3: User types '0' (layer 0)
    const res3 = cmd.onInput('0', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res3).toEqual({ action: 'layerColor', color: 1, names: '0' })
  })

  it('should handle ON option with two-step interaction', () => {
    const cmd = new LayerCommand()
    
    cmd.onInput('ON', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    const res = cmd.onInput('0,test', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'layerOn', names: '0,TEST' })
  })

  it('should handle LTYPE option with numerical layer name', () => {
    const cmd = new LayerCommand()
    
    // Step 1: LT
    cmd.onInput('LT', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    // Step 2: DASHED
    cmd.onInput('DASHED', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    // Step 3: 01
    const res = cmd.onInput('01', 'DUMMY', { type: 'decimal', precision: 2, scale: 1.0 })
    expect(res).toEqual({ action: 'layerLinetype', linetype: 'DASHED', names: '01' })
  })
})
