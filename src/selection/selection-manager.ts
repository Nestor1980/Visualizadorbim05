import * as OBC from "@thatopen/components";

// Thin state holder for selection and isolation state.
// The actual UI updates live in RightPanel; this object is passed to the
// toolbar so it can read lastModelIdMap without importing UI modules.
export class SelectionManager {
  lastModelIdMap: OBC.ModelIdMap = {};
  isIsolated = false;
}
