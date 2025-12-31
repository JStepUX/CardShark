# CardShark RPG Layer (v1.0 dream state)

# ============================================================================
# PLAYER PROGRESSION
# ============================================================================

player_character:
  persistence: "Saved to World Card (player is world-specific)"
  
  identity:
    name: "string (from user profile or custom)"
    portrait: "PNG (user-uploaded or selected)"
    player_card_id: "Treat player as a card for combat rendering"
    
  progression:
    level: 1
    current_xp: 0
    xp_to_next: "level * 100"  # 100, 200, 300...
    
  base_stats:
    hp: "50 + (level * 10)"
    damage: "level * 2"
    defense: "8 + level"
    speed: 5
    armor: 0  # Equipment only
    
  on_level_up:
    - "HP increases"
    - "Base damage increases"
    - "Defense increases"
    - "Choose 1 of 3 random perks? (future)"
    - "Unlock skill slot? (future)"

# ============================================================================
# INVENTORY & EQUIPMENT
# ============================================================================

inventory:
  structure:
    capacity: 20  # Slots, or unlimited with categories?
    categories: [weapon, armor, consumable, key_item, junk]
    
  item_sources:
    - "Loot drops from enemies"
    - "Found in rooms (room.loot_table)"
    - "Purchased from merchant NPCs (friendly NPC type)"
    - "Quest rewards"
    
equipment:
  slots:
    weapon: 1       # Determines base damage bonus + weapon_type
    armor: 1        # Determines armor value
    accessory: 1    # Future: rings, amulets, misc bonuses
    
  weapon_card:
    fields:
      name: "Iron Sword"
      damage_bonus: 3
      weapon_type: "melee"
      special: null  # Future: "Lifesteal", "Fire damage", etc.
      rarity: "common"
      
  armor_card:
    fields:
      name: "Leather Vest"
      armor_value: 2
      speed_penalty: 0
      special: null
      rarity: "common"

# ============================================================================
# LOOT SYSTEM
# ============================================================================

loot:
  enemy_drops:
    method: "Loot table per enemy type"
    structure:
      gold: "level * random(5, 15)"
      xp: "level * 10"
      items:
        - { item_id: "health_potion", chance: 0.3 }
        - { item_id: "iron_sword", chance: 0.05 }
        - { item_id: "junk_goblin_ear", chance: 0.5 }
        
  room_loot:
    method: "Defined per room instance"
    types:
      - "Chest (opened once, persistent state)"
      - "Searchable (desk, corpse, etc.)"
      - "Hidden (requires perception check or item)"
      
  rarity_tiers:
    common: { color: "gray", drop_weight: 60 }
    uncommon: { color: "green", drop_weight: 25 }
    rare: { color: "blue", drop_weight: 10 }
    epic: { color: "purple", drop_weight: 4 }
    legendary: { color: "orange", drop_weight: 1 }

# ============================================================================
# SKILLS & ABILITIES (V-Future)
# ============================================================================

skills:
  unlock_method: "Level up, quest reward, or trainer NPC"
  
  skill_slots:
    base: 2
    per_n_levels: "+1 slot every 5 levels"
    
  skill_types:
    active:
      - "Power Strike: 2 AP, deal 150% damage"
      - "Heal Self: 1 AP, restore 20 HP, 3 combat cooldown"
      - "Taunt: 1 AP, force adjacent enemy to target you"
      
    passive:
      - "Thick Skin: +1 Armor permanently"
      - "Quick Reflexes: +2 initiative"
      - "Opportunist: +2 damage on reaction shots"
      
  skill_card:
    fields:
      name: "Power Strike"
      type: "active"
      ap_cost: 2
      cooldown: 2  # Turns until usable again
      effect: "damage * 1.5"
      description: "A devastating overhead blow"
      icon: "PNG"

# ============================================================================
# MERCHANT SYSTEM (V-Future)
# ============================================================================

merchants:
  npc_type: "friendly with merchant_inventory field"
  
  interaction:
    trigger: "Click friendly NPC with merchant flag"
    ui: "Shop modal with buy/sell tabs"
    
  merchant_inventory:
    static: "Defined items always available"
    rotating: "Random selection refreshes per visit or time"
    
  economy:
    sell_ratio: 0.5  # Player sells at 50% of buy price
    currency: "gold"  # Could add multiple currencies later

# ============================================================================
# QUEST SYSTEM (V-Future)
# ============================================================================

quests:
  storage: "World card quest_log array"
  
  quest_structure:
    id: "unique_quest_id"
    name: "The Goblin Problem"
    description: "Clear the goblins from the eastern cave"
    giver_npc_id: "mayor_jenkins"
    status: "available | active | completed | failed"
    
    objectives:
      - { type: "kill", target: "goblin", count: 5, progress: 0 }
      - { type: "visit", room_id: "cave_entrance", done: false }
      - { type: "collect", item_id: "goblin_totem", count: 1, progress: 0 }
      - { type: "talk", npc_id: "cave_hermit", done: false }
      
    rewards:
      xp: 200
      gold: 50
      items: ["rare_sword_001"]
      unlocks: ["cave_back_entrance"]  # Opens new room/transition
      
  quest_triggers:
    on_enemy_kill: "Check active quests for kill objectives"
    on_room_enter: "Check for visit objectives"
    on_item_pickup: "Check for collect objectives"
    on_npc_talk: "Check for talk objectives; offer new quests"

# ============================================================================
# PERSISTENCE MODEL
# ============================================================================

world_save_structure:
  world_card_id: "uuid"
  
  player_state:
    level: 5
    xp: 450
    current_hp: 85
    max_hp: 100
    gold: 230
    position: { grid: [2, 3], room_id: "tavern" }
    equipment:
      weapon: "iron_sword_001"
      armor: "leather_vest_002"
      accessory: null
    inventory: ["health_potion", "health_potion", "goblin_ear", "cave_key"]
    skills: ["power_strike", "quick_reflexes"]
    
  room_instances:
    "[room_id]":
      npcs: "RoomNPC[]"
      loot_collected: ["chest_001", "desk_002"]
      state: { door_unlocked: true, lever_pulled: false }
      
  quest_log:
    - { quest_id: "goblin_problem", status: "active", progress: {...} }
    - { quest_id: "lost_ring", status: "completed" }
    
  world_flags:
    mayor_introduced: true
    cave_discovered: false
    boss_defeated: false