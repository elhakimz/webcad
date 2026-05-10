import { Command, CommandResponse } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";

export class FacetresCommand implements Command {
  onPoint(): CommandResponse {
    return "The FACETRES command does not require points.";
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse {
    const val = text.trim();

    if (val === "") {
      if (doc) {
        return `FACETRES = ${doc.facetres.toFixed(2)}`;
      }
      return "FACETRES";
    }

    const facetres = parseFloat(val);
    if (isNaN(facetres) || facetres < 0.01 || facetres > 10.0) {
      return "Requires a number between 0.01 and 10.0.";
    }

    if (doc) {
      doc.facetres = facetres;
    }
    return `FACETRES set to ${facetres.toFixed(2)}`;
  }

  getPreview() {
    return null;
  }

  getPrompt() {
    return "Enter new value for FACETRES:";
  }
}
