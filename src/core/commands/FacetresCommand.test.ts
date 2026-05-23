import { FacetresCommand } from "./FacetresCommand";
import { UnitsConfig, Document } from "../model/Document";
import { describe, it, expect, beforeEach } from "vitest";

describe('FacetresCommand', () => {
  let cmd: FacetresCommand;
  let units: UnitsConfig;
  let doc: Document;

  beforeEach(() => {
    cmd = new FacetresCommand();
    units = { type: 'decimal', precision: 2, scale: 1.0 };
    doc = new Document();
  });

  it('should return current value on empty input', () => {
    doc.facetres = 5.0;
    const res = cmd.onInput('', 'DUMMY', units, undefined, doc);
    expect(res).toEqual('FACETRES = 5.00');
  });

  it('should set valid facetres value', () => {
    const res = cmd.onInput('2.5', 'DUMMY', units, undefined, doc);
    expect(res).toEqual({ _echo: 'FACETRES set to 2.50', action: 'regen' });
    expect(doc.facetres).toEqual(2.5);
  });

  it('should reject invalid facetres value', () => {
    const res = cmd.onInput('abc', 'DUMMY', units, undefined, doc);
    expect(res).toEqual('Requires a number between 0.01 and 10.0.');
    expect(doc.facetres).toEqual(1.0); // Default
  });

  it('should reject out of range value', () => {
    const res = cmd.onInput('11', 'DUMMY', units, undefined, doc);
    expect(res).toEqual('Requires a number between 0.01 and 10.0.');
  });
});
