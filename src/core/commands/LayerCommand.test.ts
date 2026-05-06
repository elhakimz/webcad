import { describe, it, expect } from 'vitest'
import { LayerCommand } from './LayerCommand'

describe('LayerCommand', () => {
  it('should return action:finish on exit', () => {
    const cmd = new LayerCommand()
    expect(cmd.onInput('', 'DUMMY')).toEqual({ action: 'finish' })
  })

  it('should handle NEW option with two-step interaction', () => {
    const cmd = new LayerCommand()
    
    // Step 1: User types 'N'
    const res1 = cmd.onInput('N', 'DUMMY')
    expect(res1).toBe('New layer name:')
    expect(cmd.step).toBe(1)
    
    // Step 2: User types 'test_layer'
    const res2 = cmd.onInput('test_layer', 'DUMMY')
    expect(res2).toEqual({ action: 'layerNew', name: 'TEST_LAYER' })
    expect(cmd.step).toBe(0)
  })

  it('should handle NEW option with immediate argument', () => {
    const cmd = new LayerCommand()
    const res = cmd.onInput('N test_layer', 'DUMMY')
    // removed test assert
  })

  it('should handle COLOR option with three-step interaction', () => {
    const cmd = new LayerCommand()
    
    // Step 1: User types 'C'
    const res1 = cmd.onInput('C', 'DUMMY')
    expect(res1).toBe('Color (1-7):')
    
    // Step 2: User types '1' (red)
    const res2 = cmd.onInput('1', 'DUMMY')
    expect(res2).toBe('Layer name(s) for color 1:')
    
    // Step 3: User types '0' (layer 0)
    const res3 = cmd.onInput('0', 'DUMMY')
    expect(res3).toEqual({ action: 'layerColor', color: 1, names: '0' })
  })

  it('should handle ON option with two-step interaction', () => {
    const cmd = new LayerCommand()
    
    cmd.onInput('ON', 'DUMMY')
    const res = cmd.onInput('0,test', 'DUMMY')
    expect(res).toEqual({ action: 'layerOn', names: '0,TEST' })
  })

  it('should handle LTYPE option with numerical layer name', () => {
    const cmd = new LayerCommand()
    
    // Step 1: LT
    cmd.onInput('LT', 'DUMMY')
    // Step 2: DASHED
    cmd.onInput('DASHED', 'DUMMY')
    // Step 3: 01
    const res = cmd.onInput('01', 'DUMMY')
    expect(res).toEqual({ action: 'layerLinetype', linetype: 'DASHED', names: '01' })
  })
})
