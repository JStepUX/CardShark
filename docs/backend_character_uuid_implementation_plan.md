# Plan: Embedding Canonical UUIDs in Character PNG Metadata

**Date:** 2025-05-13

**Status:** Approved

## 1. Objective
To ensure every character PNG card saved or updated through the CardShark backend has a unique, persistent UUID embedded within its metadata. This UUID will serve as the canonical identifier for the character card when processed by CardShark.

## 2. Guiding Principles
*   **Simplicity:** Minimize new components and keep logic localized.
*   **Reliability:** Ensure the UUID, once assigned by CardShark, travels with the PNG file. Reduce points of failure.
*   **Maintainability:** Code should be easy to understand, debug, and evolve.
*   **Respect for External Files:** Standard character cards not explicitly saved through CardShark will not be modified.

## 3. Primary Affected File (Backend)
*   `backend/character_endpoints.py`

## 4. Metadata Key for UUID
*   The key `character_uuid` will be used to store the UUID string within the character's metadata JSON blob.

## 5. Backend Changes in `backend/character_endpoints.py`

*   **Ensure `uuid` Import:**
    *   Add `import uuid` at the top of the file.

*   **Modify `save_character_card` Function:**
    *   When `metadata_json` is received and parsed into `parsed_metadata` (dictionary):
        1.  Retrieve `existing_uuid = parsed_metadata.get("character_uuid")`.
        2.  Validate `existing_uuid` (e.g., check if it's a valid UUID format). This is to ensure that if the frontend sends a UUID, it's a sensible one to preserve.
        3.  If `existing_uuid` is valid and present:
            *   `final_uuid = existing_uuid` (preserve it).
        4.  Else (no UUID, or invalid existing UUID):
            *   `final_uuid = str(uuid.uuid4())` (generate a new one).
        5.  Update the metadata: `parsed_metadata["character_uuid"] = final_uuid`.
        6.  Proceed with the rest of the save logic, ensuring this `parsed_metadata` (now containing the `character_uuid`) is passed to `png_handler.write_metadata(image_bytes, parsed_metadata)`.

*   **Modify `import_from_backyard` Function (and any other import functions):**
    *   After downloading the image and reading its initial metadata into a `metadata` dictionary:
        1.  Retrieve `existing_uuid = metadata.get("character_uuid")`.
        2.  Validate `existing_uuid`.
        3.  If `existing_uuid` is valid and present:
            *   `final_uuid = existing_uuid`.
        4.  Else:
            *   `final_uuid = str(uuid.uuid4())`.
        5.  Update the metadata: `metadata["character_uuid"] = final_uuid`.
        6.  When saving the imported character, ensure these updated `metadata` are embedded into the PNG (e.g., by calling `png_handler.write_metadata(downloaded_image_bytes, metadata)` before saving the resulting bytes).

## 6. Frontend Handling Strategy

*   **Identifier Preference:**
    *   Prefer `character_uuid` if present in received metadata.
    *   Fallback to `filePath` if `character_uuid` is absent.
    *   Use this resolved ID for React keys, state management, etc.
    *   Example: `const cardId = card.metadata.character_uuid || card.filePath;`
*   **Data Structures:** Store both `filePath` and the full `metadata` object (which may or may not include `character_uuid`).
*   **Saving Cards:** When sending data to `/api/characters/save-card`:
    *   If the frontend has a `character_uuid` for the card being saved, **it must include it** in the `metadata_json`. This allows the backend to preserve it.
    *   If not, the backend will generate one.

## 7. Impact and Considerations

*   **New/Updated Cards:** All cards saved/imported via CardShark will have a `character_uuid`.
*   **Existing Cards (Not Re-saved by CardShark):** Will not have the `character_uuid` field unless they already did from another source. They will continue to be identified by their file path in the frontend until re-saved via CardShark.
*   **Standard Compliance:** Adding `character_uuid` to the metadata JSON is generally compatible with existing character card standards, which often allow for custom fields. Other tools will likely ignore this field.

## 8. Data Flow Diagram (Simplified for `save_character_card`)

```mermaid
graph TD
    subgraph Backend API: /api/characters/save-card
        direction LR
        AA[HTTP Request: PNG File + metadata_json] --> BA[Parse metadata_json into metadata_dict]
        BA --> CA{metadata_dict has valid 'character_uuid'?}
        CA -- No/Invalid --> DA[Generate new uuid.uuid4()]
        DA --> EA[Set metadata_dict.character_uuid]
        CA -- Yes --> EA[Preserve existing metadata_dict.character_uuid]
        EA --> FA[png_handler.write_metadata(image_bytes, metadata_dict)]
        FA --> GA[Save PNG with embedded UUID to disk]
        GA --> HA[HTTP Response: Success]
    end
    User[User Action via Frontend] --> AA
    HA --> User
```

## 9. Out of Scope for this Plan (Potential Future Enhancements)
*   A migration utility to retroactively add `character_uuid` to all existing character cards in a user's library.
*   An external index/map for managing UUIDs (chosen against for simplicity in this iteration).