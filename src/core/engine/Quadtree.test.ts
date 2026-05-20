import { describe, it, expect } from "vitest"
import { Quadtree } from "./Quadtree"

describe("Quadtree", () => {
  it("should insert and query items", () => {
    const qt = new Quadtree({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    qt.insert({ id: "1", box: { minX: 10, minY: 10, maxX: 20, maxY: 20 } })
    qt.insert({ id: "2", box: { minX: 50, minY: 50, maxX: 60, maxY: 60 } })

    const result = qt.query({ minX: 0, minY: 0, maxX: 30, maxY: 30 })
    expect(result).toContain("1")
    expect(result).not.toContain("2")
  })

  it("should remove items", () => {
    const qt = new Quadtree({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    qt.insert({ id: "1", box: { minX: 10, minY: 10, maxX: 20, maxY: 20 } })
    qt.insert({ id: "2", box: { minX: 50, minY: 50, maxX: 60, maxY: 60 } })

    const removed = qt.remove("1")
    expect(removed).toBe(true)

    const result = qt.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    expect(result).not.toContain("1")
    expect(result).toContain("2")
  })

  it("should return false when removing non-existent item", () => {
    const qt = new Quadtree({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    qt.insert({ id: "1", box: { minX: 10, minY: 10, maxX: 20, maxY: 20 } })

    const removed = qt.remove("2")
    expect(removed).toBe(false)
  })

  it("should remove items from children", () => {
    const qt = new Quadtree({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    // Insert many items to trigger split
    for (let i = 0; i < 15; i++) {
      qt.insert({ id: `item_${i}`, box: { minX: i, minY: i, maxX: i + 1, maxY: i + 1 } })
    }

    const removed = qt.remove("item_5")
    expect(removed).toBe(true)

    const result = qt.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    expect(result).not.toContain("item_5")
    expect(result.length).toBe(14)
  })
  it("should find items that straddle the quadrant midpoints", () => {
    // A long horizontal line crossing the vertical midpoint of a [0,100] tree
    const qt = new Quadtree({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    // Force a split by inserting maxItems+1 small items first
    for (let i = 0; i < 11; i++) {
      qt.insert({ id: `small_${i}`, box: { minX: i, minY: i, maxX: i + 1, maxY: i + 1 } })
    }
    // This line straddles the vertical midpoint (x=50); old implementation would
    // strand it at the root and never push it into any child.
    qt.insert({ id: "long_line", box: { minX: 0, minY: 10, maxX: 100, maxY: 11 } })

    // Query the right half only
    const result = qt.query({ minX: 60, minY: 0, maxX: 100, maxY: 100 })
    expect(result).toContain("long_line")
  })

  it("should not return duplicates for straddling items", () => {
    const qt = new Quadtree({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    for (let i = 0; i < 11; i++) {
      qt.insert({ id: `small_${i}`, box: { minX: i, minY: i, maxX: i + 1, maxY: i + 1 } })
    }
    qt.insert({ id: "cross", box: { minX: 0, minY: 0, maxX: 100, maxY: 100 } })

    const result = qt.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    const unique = new Set(result)
    expect(unique.size).toBe(result.length)
    expect(result).toContain("cross")
  })
})
