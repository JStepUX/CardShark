# CardShark Combat System v0.2
# Epic: COMBAT-001
# Target: Claude instances (Sonnet for implementation, Opus for design review)
# Last Updated: 2024-12-31
# Changelog: Added Swap action, Defend action, hit_quality for narrator, atomic combat rule

meta:
  inspiration: [XCOM, Yomi, Fighting Fantasy, Into the Odd, Darkest Dungeon]
  core_principle: "System handles math, AI handles drama"
  design_philosophy: "Simple to understand, hard to master"
  key_constraints:
    - "Combat is atomic - no mid-combat saves"
    - "Player controls all allies - no companion AI in V1"
    - "Click-to-target - invalid targets grayed out"

# ============================================================================
# COMBAT INITIATION
# ============================================================================

initiation:
  triggers:
    v1_deliberate:
      action: "User clicks hostile NPC in room showcase"
      result: "Combat modal opens"
      advantage: player
      
    v2_transition:
      action: "Player moves to room with hostile NPCs assigned to transition"
      result: "Random encounter check → combat modal if triggered"
      advantage: enemy
      
  advantage_effects:
    player_advantage:
      - "Player arranges party in 5-slot formation before combat"
      - "Enemies get random/type-default placement"
      - "Optional: surprise round (enemies skip turn 1)"
      
    enemy_advantage:
      - "Player party gets random placement"
      - "Enemies get optimal formation per type"
      - "Optional: players start turn 1 with 1 AP instead of 2"

  combat_persistence:
    rule: "Combat is atomic - cannot save mid-combat"
    on_quit: "Encounter resets; player returns to pre-combat state"
    rationale: "Prevents save-scumming; keeps state clean"

# ============================================================================
# BATTLEFIELD TOPOLOGY
# ============================================================================

battlefield:
  structure:
    rows: 2  # enemy row (top), ally row (bottom)
    slots_per_row: 5
    slot_indices: [0, 1, 2, 3, 4]  # left to right, 0-indexed
    
  initial_placement:
    player_default: 2  # center (0-indexed)
    ally_default: random
    enemy_default: type_based
    
  enemy_formation_preferences:
    melee: [2, 3, 1, 4, 0]      # cluster center
    ranged: [0, 4, 1, 3, 2]     # spread edges
    boss: [2]                    # center, minions fill around
    swarm: random                # chaotic

  adjacency:
    definition: "Slots N and N±1 are adjacent (within same row)"
    cross_row: "All enemy slots are 'engaged' with all ally slots for attack purposes"
    bonuses:
      ally_adjacent: "+1 attack roll"
      enemy_adjacent_ranged: "-2 attack roll (too close to aim)"
    
  aoe_targeting:  # Future consideration
    adjacent_splash: "Hits target slot and both adjacent slots"
    line_attack: "Hits all occupied slots in a row"

# ============================================================================
# ACTION ECONOMY
# ============================================================================

action_economy:
  ap_per_turn: 2
  
  actions:
    move:
      cost_adjacent_empty: 1
      cost_past_ally: 2
      cost_past_enemy: blocked  # Cannot pass enemies
      ends_turn: "Only if 2 AP spent"
      
    swap:
      description: "Switch positions with adjacent ally"
      cost: 1
      ends_turn: false
      requirement: "Ally must be in adjacent slot"
      rationale: "Enables tank rotation without wasting full turn"
      
    attack:
      cost: 2
      ends_turn: true
      targeting: "Click enemy card directly; invalid targets grayed out"
      
    defend:
      description: "Brace for incoming attacks"
      cost: 1
      ends_turn: true
      effect: "+2 Defense until start of next turn"
      alt_effect: "+1 Armor until start of next turn"  # Design choice TBD
      rationale: "Gives purpose to leftover 1 AP when movement isn't useful"
      
    overwatch:
      cost: 2
      ends_turn: true
      trigger: "Enemy moves or attacks"
      effect: "Interrupt with reaction shot at -1 to hit"
      
    use_item:
      cost: 1
      ends_turn: false
      examples: ["Heal potion", "Grenade", "Buff scroll"]
      
    flee:
      cost: 2
      ends_turn: true
      requirement: "Must be at edge slot (0 or 4)"
      check: "1d20 + speed >= 10 + fastest_enemy_speed"
      
    reload:  # Future: if ammo system added
      cost: 1
      ends_turn: false

  valid_combinations:
    - "Move + Move (if both cost 1)"
    - "Move + Swap"
    - "Move + Attack"
    - "Move + Defend"
    - "Swap + Attack"
    - "Swap + Defend"
    - "Swap + Swap (repositioning two allies)"
    - "Item + Attack"
    - "Item + Move"
    - "Item + Item (if you have 2 items to use)"
    
  invalid_combinations:
    - "Attack + anything (attack ends turn)"
    - "Overwatch + anything (overwatch ends turn)"
    - "Flee + anything (flee ends turn)"

# ============================================================================
# COMBAT STATS
# ============================================================================

stats:
  base_stats:
    hp:
      formula: "level * 10 + base_hp"
      example: "Level 2 goblin (base 10) = 2*10+10 = 30 HP"
      
    damage:
      formula: "level * 2 + weapon_bonus"
      example: "Level 2 + iron sword(3) = 2*2+3 = 7 damage"
      note: "Weapon bonus is primary progression feel"
      
    defense:
      formula: "level * 2 + base_defense"
      purpose: "Target number to hit (roll >= defense)"
      
    armor:
      source: "Equipment only (not level-scaled)"
      purpose: "Flat damage reduction"
      range: [0, 5]
      note: "Armor bonus is secondary progression feel"
      
    speed:
      formula: "base_speed + modifiers"
      purpose: "Initiative order; tiebreaker"
      range: [1, 10]
      
  derived_stats:
    initiative:
      formula: "speed + 1d6 at combat start"
      ties: "Higher base speed > favor players > random"
      
    hit_chance:
      formula: "1d20 + attack_bonus >= target.defense"
      modifiers:
        ally_adjacent: +1
        ranged_at_adjacent_enemy: -2
        overwatch_shot: -1
        defending: "target.defense + 2"
        
    damage_dealt:
      formula: "damage - target.armor"
      minimum: 1
      note: "Minimum 1 prevents invincibility; Armor should never fully negate"

  balance_notes:
    ttk_concern: |
      If HP and Damage scale linearly, Time-to-Kill stays constant.
      Weapon/Armor bonuses should provide progression "feel".
      Monitor: Level 10 enemy with 10 Armor vs Level 1 player (4 damage).
      Safety net: minimum 1 damage rule.

# ============================================================================
# HIT QUALITY SYSTEM
# ============================================================================

hit_quality:
  purpose: "Provide narrator with mechanical context for dramatic variation"
  
  calculation:
    margin: "attack_roll - target_defense"
    
  tiers:
    miss:
      condition: "margin < 0"
      narrator_hint: "Describe a dodge, deflection, or whiff"
      
    marginal_hit:
      condition: "margin 0-2"
      narrator_hint: "Clumsy, desperate, or lucky strike; barely connected"
      
    solid_hit:
      condition: "margin 3-7"
      narrator_hint: "Clean, competent blow; no flourish needed"
      
    crushing_hit:
      condition: "margin >= 8"
      narrator_hint: "Devastating, overwhelming, perfect strike"
      
    armor_soak:
      condition: "hit AND raw_damage > 2 AND final_damage <= 1"
      narrator_hint: "Weapon clangs off armor; protected but staggered"
      
    overkill:
      condition: "final_damage >= target.current_hp * 2"
      narrator_hint: "Excessive force; describe brutal finishing blow"

# ============================================================================
# OVERWATCH SYSTEM
# ============================================================================

overwatch:
  activation:
    cost: 2
    ends_turn: true
    
  trigger_conditions:
    - "Enemy in line of sight moves"
    - "Enemy in line of sight attacks"
    
  reaction_shot:
    hit_modifier: -1
    timing: "Interrupts enemy action; resolves before enemy action completes"
    
  on_hit:
    effect: "Deal damage; enemy action still completes"
    optional_rule: "Hit stops movement (enemy ends in current slot)"
    
  on_miss:
    effect: "Enemy action completes normally"
    
  limitations:
    - "One reaction per overwatcher per round"
    - "Overwatch clears at start of your next turn"
    - "Multiple overwatchers trigger in initiative order"
    
  counter_play:
    - "Enemies can bait overwatch with low-value units"
    - "Defend action doesn't trigger overwatch"

# ============================================================================
# FLEE MECHANICS
# ============================================================================

flee:
  requirements:
    position: "Must be at edge slot (0 or 4)"
    ap: 2
    
  check:
    formula: "1d20 + speed >= 10 + fastest_enemy_speed"
    auto_success: "If no enemies remain"
    
  outcomes:
    success:
      - "Character escapes combat"
      - "Removed from battlefield"
      - "Does not receive combat rewards"
      
    failure:
      - "Remain in combat at edge slot"
      - "Turn ends"
      - "No additional penalty beyond wasted AP"
      
  party_flee:
    rule: "Each character flees individually"
    full_retreat: "Combat ends when all player characters have fled or fallen"

# ============================================================================
# DEATH & DEFEAT
# ============================================================================

death:
  player_character:
    trigger: "HP <= 0"
    state: "Knocked out (not dead)"
    recovery: "After combat if party wins; stays down if TPK"
    
  total_party_kill:
    trigger: "All player characters HP <= 0"
    consequences:
      - "Combat ends immediately"
      - "Player respawns at world grid position [0,0]"
      - "HP restored to 25% of max"
      - "Optional: lose percentage of gold"
      - "Optional: drop one random item"
    narrative: "AI describes defeat and mysterious rescue/recovery"
    
  enemy_death:
    trigger: "HP <= 0"
    effect: "Removed from battlefield immediately"
    animation: "Card grays, cracks, fades out"

# ============================================================================
# VICTORY & REWARDS
# ============================================================================

victory:
  trigger: "All enemies defeated OR all enemies fled"
  
  rewards:
    xp:
      formula: "sum(enemy.level * 10)"
      distribution: "Split among surviving party members"
      
    gold:
      formula: "sum(enemy.level * random(5, 15))"
      
    items:
      method: "Loot table roll per enemy"
      chance: "Based on enemy type and level"
      
  knockout_recovery:
    rule: "KO'd allies revive at 1 HP after victory"
    
  narrative:
    trigger: "combat_victory event"
    context: [final_blow_dealer, turns_taken, party_health_remaining, overkill_amount]

# ============================================================================
# UI ARCHITECTURE
# ============================================================================

ui:
  layout: 
    type: "modal_takeover"
    escape_key: "Disabled during combat (no accidental exits)"
    close_button: "Hidden during combat; shown only on victory/defeat"
    
  components:
    battlefield:
      structure: "2 rows × 5 columns grid"
      enemy_row:
        position: top
        empty_slot_style: "Red border, dark fill"
      ally_row:
        position: bottom
        empty_slot_style: "Blue border, dark fill"
      card_display:
        - "NPC PNG fills card frame"
        - "Level badge (top-left, circular)"
        - "Attack stat badge (bottom-left)"
        - "Defense stat badge (bottom-right)"
        - "Name plate (bottom center)"
        - "HP bar (bottom, overlaid on name plate)"
      active_turn_indicator: "Blue arrow above card, pulsing"
      damage_display:
        style: "Red number with slash graphic overlay"
        duration: "1.5s fade out"
        position: "Center of card"
      defeated_state:
        style: "Grayscale, 50% opacity, slight tilt"
        animation: "Crack effect, then fade"
      valid_target_indicator: "Subtle glow or border highlight"
      invalid_target_indicator: "Grayed out, not clickable"
      
    initiative_timeline:
      location: "Right side of combat log area"
      width: "~150px"
      display: "3 mini card portraits (prev, current, next)"
      current_turn:
        style: "Centered, larger (1.15x scale), blue ring"
        indicator: "Blue arrow above"
      adjacent_turns:
        style: "Smaller (0.85x scale), 50% opacity"
      edges: "Fade to black gradient"
      
    combat_log:
      location: "Below battlefield"
      sections:
        turn_counter: "Combat Turn #N"
        mechanical_result: "Red text - 'Aria strikes Goblin for 14 damage!'"
        narrator_flavor: "White/gray text - AI-generated description"
      scroll: "Auto-scroll to latest; manual scroll to review history"
      
    player_hud:
      location: "Bottom left"
      content:
        portrait: "64px thumbnail"
        hp_bar: "Wide bar with 'HP: current/max' text"
        ap_indicator: "Show remaining AP (2 dots/pips)"
        status_effects: "Icons for Defending, Overwatching, etc."
        
    action_buttons:
      location: "Bottom right"
      buttons:
        - { name: "Attack", icon: "swords", hotkey: "A" }
        - { name: "Defend", icon: "shield", hotkey: "D" }
        - { name: "Overwatch", icon: "eye/clock", hotkey: "O" }
        - { name: "Move", icon: "footsteps", hotkey: "M" }
        - { name: "Swap", icon: "arrows-exchange", hotkey: "S" }
        - { name: "Item", icon: "potion", hotkey: "I" }
        - { name: "Flee", icon: "running", hotkey: "F" }
      style: "~80px square, icon + label below"
      states:
        available: "Full color, clickable"
        unavailable: "Grayed out, tooltip explains why"
        selected: "Highlighted border, awaiting target selection"
        
    move_mode:
      trigger: "Click Move button"
      display: "Valid destination slots highlight in ally row"
      cancel: "Right-click or press Escape"
      
    targeting_mode:
      trigger: "Click Attack button"
      display: "Valid enemy targets get glow; invalid grayed out"
      selection: "Click valid target to confirm"
      cancel: "Right-click or press Escape"
      
    pre_battle_screen:
      trigger: "Player-initiated combat"
      content:
        instruction: "Drag your party into position"
        ally_slots: "5 slots, draggable ally cards"
        enemy_preview: "Show enemy formation (not draggable)"
        button: "BEGIN COMBAT"
      
  background:
    source: "Current room's image"
    treatment: "Dark gradient overlay (bottom 40%)"
    fallback: "Solid dark gray (#0a0a0a)"

# ============================================================================
# DATA ARCHITECTURE
# ============================================================================

data:
  room_card_template:
    field: "suggestedNpcs: RoomNPC[]"
    purpose: "Default NPCs for this room design"
    mutability: "Never mutated at runtime"
    on_import: "Deep-copied to world instance"
    
  world_card_instance:
    structure:
      roomInstances:
        "[roomId]":
          npcs: "RoomNPC[] - actual runtime NPCs"
          state: "Record<string, any> - loot taken, doors opened, etc."
    mutability: "Source of truth at runtime; persisted on save"
    
  combat_state:
    turn: "number - current turn count"
    phase: "enum: INITIATIVE | TURN_START | AWAITING_INPUT | RESOLVING | TURN_END | COMBAT_OVER"
    initiative_order: "string[] - character IDs sorted by initiative"
    current_turn_index: "number - index in initiative_order"
    battlefield:
      enemy_slots: "[null, null, CombatantState, CombatantState, null]"
      ally_slots: "[null, null, CombatantState, null, CombatantState]"
    active_effects:
      overwatching: "string[] - IDs currently on overwatch"
      defending: "string[] - IDs with defend bonus active"
    combat_log: "CombatLogEntry[]"
    pending_reaction: "ReactionEvent | null - for overwatch resolution"
    
  combatant_state:
    id: "string - reference to NPC or player card"
    current_hp: "number"
    max_hp: "number"
    slot_position: "number (0-4)"
    ap_remaining: "number (0-2)"
    is_player_controlled: "boolean"
    status:
      is_defending: "boolean"
      is_overwatching: "boolean"
      is_knocked_out: "boolean"
    recent_damage: "number | null - for UI animation, clears after render"
    
  combat_log_entry:
    turn: "number"
    actor_id: "string"
    action_type: "enum: ATTACK | MOVE | DEFEND | OVERWATCH | ITEM | FLEE | SWAP"
    target_id: "string | null"
    result:
      hit: "boolean"
      damage: "number"
      hit_quality: "enum: MISS | MARGINAL | SOLID | CRUSHING | ARMOR_SOAK"
      special: "string | null - 'CRITICAL' | 'KILLING_BLOW' | 'FLED'"
    narrator_text: "string - AI-generated flavor"

# ============================================================================
# NARRATOR INTEGRATION
# ============================================================================

narrator:
  approach: "Event-driven; narrator receives mechanical events with context"
  
  events:
    combat_start:
      context: [party_composition, enemy_composition, room_name, who_initiated]
      tone: "Set the scene; tension appropriate to threat level"
      
    turn_start:
      frequency: "Sparse - every 3rd turn or on significant moments"
      context: [current_combatant, battlefield_state, turn_number]
      
    attack_resolved:
      context:
        attacker: "name, type, weapon"
        defender: "name, type, current_hp, max_hp"
        hit_quality: "MISS | MARGINAL | SOLID | CRUSHING | ARMOR_SOAK"
        damage_dealt: "number (after armor)"
        is_killing_blow: "boolean"
        overkill_amount: "number (damage beyond 0 HP)"
      style_guidance:
        MISS: "Describe dodge, parry, or whiff"
        MARGINAL: "Glancing blow, lucky hit, desperate strike"
        SOLID: "Clean hit, no need for flourish"
        CRUSHING: "Devastating, overwhelming, precise"
        ARMOR_SOAK: "Clang of metal, staggering impact, no wound"
        killing_blow: "Finality, dramatic finish"
        overkill: "Excessive force, brutal imagery (within taste)"
        
    character_defeated:
      context: [defeated_name, defeated_type, killing_blow_dealer, remaining_enemies]
      ally_defeated: "Concern, urgency"
      enemy_defeated: "Satisfaction, progress"
      
    combat_victory:
      context: [turns_taken, party_health_remaining, mvp_by_damage, close_calls]
      tone: "Relief, triumph, proportional to difficulty"
      
    combat_defeat:
      context: [last_standing, killing_blow, turns_survived]
      tone: "Grim but not hopeless; hint at recovery"
      
    flee_attempt:
      context: [fleeing_character, success, remaining_party]
      success: "Describe escape"
      failure: "Describe failed escape, enemy blocking"
      
  style_guidance:
    length: "1-2 sentences; brevity over purple prose"
    variety: "Track recent descriptions; avoid repetition"
    genre_awareness: "Match world card genre/tone if specified"
    gore_level: "Moderate by default; adjustable per world settings"

# ============================================================================
# IMPLEMENTATION PHASES
# ============================================================================

phases:
  v1_core:
    priority: "MVP - playable combat loop"
    features:
      - "Modal combat UI with 5-slot battlefield"
      - "Turn-based initiative (speed + 1d6)"
      - "Basic actions: Attack, Defend, Flee"
      - "HP tracking and damage resolution (with armor)"
      - "Hit quality calculation"
      - "Victory/defeat conditions"
      - "Room image as backdrop"
      - "Basic narrator integration (attack results)"
      - "Click-to-target enemies"
    deferred:
      - "Movement between slots"
      - "Overwatch"
      - "Items"
      - "Pre-battle arrangement"
    
  v2_tactics:
    priority: "Tactical depth"
    features:
      - "Movement between slots (1-2 AP)"
      - "Swap action"
      - "Overwatch system"
      - "Adjacency bonuses"
      - "Pre-battle arrangement (player-initiated)"
      - "Random placement (enemy-initiated)"
      - "AP indicator in UI"
      - "Move mode / targeting mode UI states"
    
  v3_depth:
    priority: "Content variety"
    features:
      - "Weapon types (melee/ranged with range rules)"
      - "Items and inventory in combat"
      - "Status effects (poison, stun, bleed)"
      - "Enemy AI behaviors (aggressive, defensive, tactical)"
      - "AOE attacks (adjacent splash)"
      - "Companion personality presets (optional AI control)"
    
  v4_polish:
    priority: "Experience quality"
    features:
      - "Theme packs (card frames, icons, sounds)"
      - "Combat animations (card shake, slide, flip)"
      - "Transition encounters (V2 initiation)"
      - "Loot and rewards system"
      - "Combat stats/achievements tracking"
      - "Hotkey support"
      - "Sound effects"

# ============================================================================
# TECHNICAL RECOMMENDATIONS
# ============================================================================

implementation_notes:
  architecture:
    pattern: "Combat Engine as pure reducer function"
    signature: "(state: CombatState, action: CombatAction) => { newState: CombatState, events: CombatEvent[] }"
    rationale: "Predictable, testable, replayable; events drive both UI and narrator"
    
  narrator_bridge:
    pattern: "Event translator"
    input: "CombatEvent[]"
    output: "Narrator prompt with mechanical context"
    async: "Narrator calls can be fire-and-forget; UI doesn't wait"
    
  state_persistence:
    rule: "Combat state lives in memory only"
    on_quit: "Discard combat state; restore pre-combat world state"
    on_victory: "Apply rewards to world state; persist"
    on_defeat: "Apply penalties to world state; persist"
    
  ui_integration:
    pattern: "Combat state drives UI; UI dispatches actions"
    framework: "React with useReducer or context"
    animations: "CSS transitions; combat state includes 'recent_damage' for flash effects"

# ============================================================================
# OPEN QUESTIONS (Resolved)
# ============================================================================

resolved_questions:
  companion_ai: "Player controls all allies in V1; AI personalities in V3+"
  targeting: "Click card directly; invalid targets grayed out"
  multiple_enemies: "Player chooses target (focus fire is strategic)"
  death: "Recoverable (KO, not permadeath); respawn at grid origin on TPK"
  save_mid_combat: "No. Combat is atomic. Quit = encounter resets."
  defend_action: "Added at 1 AP, ends turn, +2 Defense until next turn"
  swap_action: "Added at 1 AP, doesn't end turn, requires adjacent ally"

# ============================================================================
# REMAINING OPEN QUESTIONS
# ============================================================================

open_questions:
  - "Defend effect: +2 Defense OR +1 Armor? (Defense = harder to hit; Armor = less damage)"
  - "Overwatch hit: Does it stop enemy movement or just damage?"
  - "Healing: Flat amount, percentage, or level-scaled?"
  - "Multiple overwatchers: All trigger, or just first in initiative?"
  - "Enemy AI targeting: Random, lowest HP, highest threat, or type-based?"
  - "Combat animations: Card shake, slide, flip?"
  - "Combat stats/achievements tracking: XP, gold, items?"
  - "Hotkey support: Movement, actions, inventory?"