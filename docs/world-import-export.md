# World Import/Export Process 🌍📦

This document explains the technical and workflow details of the World Import/Export process in CardShark. This system is designed to make sharing, cloning, and versioning complex worlds easy and reliable.

## 🌟 Overview

A "World" in CardShark isn't just a single file—it's a collection of many interconnected parts:
- **The World Card:** Stores the map layout, grid settings, and global atmosphere.
- **Room Cards:** Each room on the map is its own card with its own description and settings.
- **Character Cards (NPCs):** The people and creatures that inhabit those rooms.

The Import/Export process bundles all of these into a single `.cardshark.zip` archive.

---

## 📤 The Export Process: Packaging the World

When you export a world, the system performs a "dependency crawl":

1.  **World Card:** It starts by grabbing the main World PNG and its metadata.
2.  **Room Crawl:** It looks at every room placed on the world grid and finds their respective PNG files.
3.  **NPC Crawl:** For every room, it checks which NPCs are assigned and gathers their Character PNG files.
4.  **Bundling:** All these files are placed into a specific structure inside the ZIP:
    ```text
    [WorldName].cardshark.zip
    ├── world.png             (Main World Card)
    ├── rooms/
    │   ├── room1.png
    │   └── room2.png
    └── characters/
        ├── npc-alpha.png
        └── npc-beta.png
    ```

**Designer Note:** The export is "self-contained." You don't need to manually collect the characters or rooms; the system handles the entire hierarchy for you.

---

## 📥 The Import Process: Bringing it to Life

Importing a `.cardshark.zip` is more than just unzipping. To ensure the world works correctly without breaking your existing library, the system performs several critical steps:

### 1. Unique Identity (UUID) Regeneration
Every character, room, and world in CardShark has a unique ID (UUID). 
- **The Problem:** If you import a world that someone else created, their IDs might conflict with yours, or you might want to import the same world twice as a template.
- **The Solution:** Upon import, CardShark **generates brand new IDs** for every single component in the ZIP.

### 2. Reference Relinking
Because all the IDs just changed, the system has to "rewire" the internal connections:
- **NPCs to Rooms:** Each room is updated to point to the *new* NPC IDs.
- **Rooms to World:** The world map is updated to point to the *new* Room IDs.
- **Metadata Update:** These new IDs are baked directly into the metadata of the PNG files during the import.

### 3. Library Integration
Finally, the PNG files are saved into your local library folders, and the database is synchronized so the new world shows up immediately in your Gallery.

---

## 💡 Key Benefits & Use Cases

- **Collaboration:** Send a single file to a fellow designer, and they get exactly what you built—NPCs, room settings, and map layout included.
- **Cloning & Templating:** Want to create a "Forest" world and then make a "Winter Forest" version? Export the first one and re-import it. You'll have two identical but independent worlds to work with.
- **Safety:** Because of UUID regeneration, importing a world will **never** overwrite your existing characters or rooms, even if they have the same names.

## 🛠️ How to Use

- **To Export:** Open the World Launcher or Gallery, select your world, and look for the **Export** button.
- **To Import:** Look for the **Import World** button in the World Gallery. Select any `.cardshark.zip` file, and the system will handle the rest.

---

*For technical issues or feature requests regarding the Export/Import system, please contact the development team.*
