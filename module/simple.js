// Import Modules
import { SimpleActor } from "./actor.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";
import { SimpleActorSheet, NPCActorSheet } from "./actor-sheet.js";
import { CompanionActorSheet } from "./actor-sheet-companion.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { createDaggerheartMacro } from "./macro.js";
import { SimpleToken, SimpleTokenDocument } from "./token.js";
import { CounterUI } from "./counter-ui.js";
import { TokenCounterUI } from "./token-counter-ui.js";
import { SheetTracker } from "./sheet-tracker.js";

import { _rollHope, _rollFear, _rollDuality, _rollNPC, _checkCritical, _enableForcedCritical, _disableForcedCritical, _isForcedCriticalActive, _quickRoll, _dualityWithDialog, _npcRollWithDialog, _waitFor3dDice } from './rollHandler.js';

/**
 @param {Actor|null} actor (optional if level is provided)
 @param {number|null} level (optional, will use actor's level if not provided)
 @returns {number}
 */

function _getTierOfPlay(actor = null, level = null) {
  let characterLevel = level;
  
  if (characterLevel === null || characterLevel === undefined) {
    if (!actor) {
      console.warn("Daggerheart | getTierOfPlay: No actor or level provided, defaulting to tier 1");
      return 1;
    }
    characterLevel = actor.system?.level?.value || 1;
  }
  
  characterLevel = parseInt(characterLevel) || 1;
  characterLevel = Math.max(1, Math.min(10, characterLevel));
  
  if (characterLevel === 1) return 1;
  if (characterLevel >= 2 && characterLevel <= 4) return 2;
  if (characterLevel >= 5 && characterLevel <= 7) return 3;
  if (characterLevel >= 8 && characterLevel <= 10) return 4;
  
  return 1;
}

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

/**
 * Init hook.
 */
Hooks.once("init", async function() {
  console.log(`Initializing Simple Daggerheart System`);

  // CONFIG.statusEffects = [];

  CONFIG.statusEffects.push({
    id: "hidden",
    label: "Hidden",
    icon: "icons/svg/invisible.svg"
  });
  CONFIG.statusEffects.push({
    id: "restrained",
    label: "Restrained",
    icon: "icons/svg/padlock.svg"
  });
  CONFIG.statusEffects.push({
    id: "vulnerable",
    label: "Vulnerable",
    icon: "icons/svg/stoned.svg"
  });

  /**
   * Set an initiative formula for the system. This will be updated later.
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d20",
    decimals: 2
  };

  game.daggerheart = {
    SimpleActor,
    createDaggerheartMacro,
    SheetTracker,
    rollHandler: {
      rollHope: _rollHope,
      rollFear: _rollFear,
      rollDuality: _rollDuality,
      rollNPC: _rollNPC,
      checkCritical: _checkCritical,
      enableForcedCritical: _enableForcedCritical,
      disableForcedCritical: _disableForcedCritical,
      isForcedCriticalActive: _isForcedCriticalActive,
      quickRoll: _quickRoll,
      dualityWithDialog: _dualityWithDialog,
      npcRollWithDialog: _npcRollWithDialog,
      waitFor3dDice: _waitFor3dDice
    },
    getTierOfPlay: _getTierOfPlay
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Actor.typeLabels = {
    character: "ACTOR.TypeCharacter",
    npc: "ACTOR.TypeNpc",
    companion: "ACTOR.TypeCompanion"
  };
  CONFIG.Item.documentClass = SimpleItem;
  CONFIG.Item.typeLabels = {
    item: "ITEM.TypeItem",
    inventory: "ITEM.TypeInventory",
    worn: "ITEM.TypeWorn",
    domain: "ITEM.TypeDomain",
    vault: "ITEM.Vault",
    ancestry: "ITEM.TypeAncestry",
    community: "ITEM.TypeCommunity",
    class: "ITEM.TypeClass",
    subclass: "ITEM.TypeSubclass"
  };
  CONFIG.Token.documentClass = SimpleTokenDocument;
  CONFIG.Token.objectClass = SimpleToken;

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.applications.sheets.ActorSheetV2);
  foundry.documents.collections.Actors.registerSheet("daggerheart", SimpleActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "SHEET.Actor.character"
  });
  foundry.documents.collections.Actors.registerSheet("daggerheart", NPCActorSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "SHEET.Actor.npc"
  });
  foundry.documents.collections.Actors.registerSheet("daggerheart", CompanionActorSheet, {
    types: ["companion"],
    makeDefault: true,
    label: "SHEET.Actor.companion"
  });
  foundry.documents.collections.Items.unregisterSheet("core", foundry.applications.sheets.ItemSheetV2);
  foundry.documents.collections.Items.registerSheet("daggerheart", SimpleItemSheet, {
    makeDefault: true,
    label: "SHEET.Item.default"
  });

  // Register system settings
  game.settings.register("daggerheart", "macroShorthand", {
    name: "SETTINGS.SimpleMacroShorthandN",
    hint: "SETTINGS.SimpleMacroShorthandL",
    scope: "world",
    type: Boolean,
    default: true,
    config: true
  });

  // Register counter value setting
  game.settings.register("daggerheart", "counterValue", {
    name: "Counter Value",
    hint: "The current value of the counter",
    scope: "world",
    type: Number,
    default: 0,
    config: false // Don't show in settings menu
  });

  // init setting
  game.settings.register("daggerheart", "initFormula", {
    name: "SETTINGS.SimpleInitFormulaN",
    hint: "SETTINGS.SimpleInitFormulaL",
    scope: "world",
    type: String,
    default: "1d20",
    config: true,
    onChange: formula => _simpleUpdateInit(formula, true)
  });

  // init formula
  const initFormula = game.settings.get("daggerheart", "initFormula");
  _simpleUpdateInit(initFormula);

  /**
   * Update the initiative formula.
   * @param {string} formula - Dice formula to evaluate.
   * @param {boolean} notify - Whether or not to post nofications.
   */
  function _simpleUpdateInit(formula, notify = false) {
    const isValid = Roll.validate(formula);
    if ( !isValid ) {
      if ( notify ) ui.notifications.error(`${game.i18n.localize("SIMPLE.NotifyInitFormulaInvalid")}: ${formula}`);
      return;
    }
    CONFIG.Combat.initiative.formula = formula;
  }

  /**
   * Slugify a string.
   */
  Handlebars.registerHelper('slugify', function(value) {
    return value.slugify({strict: true});
  });

  // Preload template partials
  await preloadHandlebarsTemplates();
});

/**
 * Macrobar hook.
 */
Hooks.on("hotbarDrop", (bar, data, slot) => {
  // For items, we want to create a macro instead of the default item behavior
  if (data.type === "Item") {
    createDaggerheartMacro(data, slot);
    return false; // Prevent default behavior
  }
  return createDaggerheartMacro(data, slot);
});

/**
 * Ready hook to initialize the counter UI
 */
Hooks.once("ready", async function() {
  // Initialize the counter UI
  game.daggerheart.counter = new CounterUI();
  await game.daggerheart.counter.initialize();
  
  // Initialize the token counter UI
  game.daggerheart.tokenCounter = new TokenCounterUI();
  await game.daggerheart.tokenCounter.initialize();
  
  console.log("Counter UI initialized and displayed above the hotbar.");
});

/**
 * Hook to set default prototype token settings for actors
 */
Hooks.on("preCreateActor", function(document, data, options, userId) {
  // Set default prototype token settings
  const prototypeToken = {
    actorLink: true
  };
  
  // Merge with any existing prototype token data
  document.updateSource({
    "prototypeToken": foundry.utils.mergeObject(document.prototypeToken?.toObject() || {}, prototypeToken)
  });
});

/**
 * Hook to add damage button to attack roll chat messages
 */
Hooks.on("renderChatMessage", (message, html, data) => {
  // Get roll type and actor information from message flags
  const flags = message.flags?.daggerheart;
  if (!flags) return;
  
  const rollType = flags.rollType;
  const actorId = flags.actorId;
  const actorType = flags.actorType;
  const weaponName = flags.weaponName;
  
  // Only add damage buttons to attack rolls, not damage rolls
  if (rollType !== "attack") return;
  
  // Check for existing button
  const existingButton = html.find(".damage-roll-button").length;
  if (existingButton > 0) return;
  
  // Get the actor
  const actor = game.actors.get(actorId);
  if (!actor) return;
  
  // Get weapon data
  let weaponData = null;
  let weaponType = null;
  
  const primaryWeapon = actor.system["weapon-main"];
  const secondaryWeapon = actor.system["weapon-off"];
  
  if (primaryWeapon?.name === weaponName) {
    weaponData = primaryWeapon;
    weaponType = "primary";
  } else if (secondaryWeapon?.name === weaponName) {
    weaponData = secondaryWeapon;
    weaponType = "secondary";
  }
  
  if (!weaponData || !weaponData.damage) return;
  
  // Check if this was a critical success
  const flavor = message.flavor || '';
  const isCritical = flavor.includes("Critical") && flavor.includes("Success");
  
  // Add damage button based on actor type
  if (actorType === "character") {
    _addCharacterDamageButton(html, actor, weaponData, weaponType, isCritical);
  } else if (actorType === "npc") {
    _addAdversaryDamageButton(html, actor, weaponData, weaponType, isCritical);
  }
});

/**
 * Add damage button for character attack rolls
 */
function _addCharacterDamageButton(html, actor, weaponData, weaponType, isCritical) {
  const buttonText = isCritical ? "Critical Damage" : "Damage";
  const damageButton = `<button class="damage-roll-button character ${isCritical ? 'critical' : ''}" data-actor-id="${actor.id}" data-weapon-type="${weaponType}" data-weapon-name="${weaponData.name}" data-weapon-damage="${weaponData.damage}" data-is-critical="${isCritical}" style="margin-top: 0.5em; width: 100%;">
    <i class="fas fa-dice-d20"></i> ${buttonText}
  </button>`;
  
  html.find(".message-content").append(damageButton);
  
  // Add click handler for character damage
  html.find(".damage-roll-button.character").click(async (event) => {
    event.preventDefault();
    await _rollCharacterDamage(event);
  });
}

/**
 * Add damage button for adversary attack rolls
 */
function _addAdversaryDamageButton(html, actor, weaponData, weaponType, isCritical) {
  const buttonText = isCritical ? "Critical Damage" : "Damage";
  const damageButton = `<button class="damage-roll-button adversary ${isCritical ? 'critical' : ''}" data-actor-id="${actor.id}" data-weapon-type="${weaponType}" data-weapon-name="${weaponData.name}" data-weapon-damage="${weaponData.damage}" data-is-critical="${isCritical}" style="margin-top: 0.5em; width: 100%;">
    <i class="fas fa-dice-d20"></i> ${buttonText}
  </button>`;
  
  html.find(".message-content").append(damageButton);
  
  // Add click handler for adversary damage
  html.find(".damage-roll-button.adversary").click(async (event) => {
    event.preventDefault();
    await _rollAdversaryDamage(event);
  });
}

/**
 * Handle damage button creation for player characters
 */
function _handleCharacterDamageButton(message, html, actor, flavor) {
  let weaponData = null;
  let weaponType = null;
  
  // Check if the flavor contains a weapon name that matches actor's weapons
  const primaryWeapon = actor.system["weapon-main"];
  const secondaryWeapon = actor.system["weapon-off"];
  
  if (primaryWeapon?.name && flavor.includes(primaryWeapon.name)) {
    weaponData = primaryWeapon;
    weaponType = "primary";
  } else if (secondaryWeapon?.name && flavor.includes(secondaryWeapon.name)) {
    weaponData = secondaryWeapon;
    weaponType = "secondary";
  }
  
  // Check for existing button
  const existingButton = html.find(".damage-roll-button").length;
  
  // If we found a matching weapon and it has damage defined
  if (weaponData && weaponData.damage && !existingButton) {
    // Check if this appears to be a damage roll (exclude damage rolls)
    const isDamageRoll = flavor.includes("Damage") || 
                        flavor.includes("damage") || 
                        flavor.toLowerCase().includes("- damage") ||
                        flavor.includes("Critical Damage") ||
                        flavor.includes("critical damage");
    
    // Check if this appears to be an attack roll (has Hope/Fear dice) but NOT a damage roll
    const hasHopeFear = flavor.includes("Hope") || flavor.includes("Fear");
    
    if (hasHopeFear && !isDamageRoll) {
      // Check if this was a critical success
      const isCritical = flavor.includes("Critical") && flavor.includes("Success");
      
      // Add damage button to the message
      const buttonText = isCritical ? "Critical Damage" : "Damage";
      const damageButton = `<button class="damage-roll-button character ${isCritical ? 'critical' : ''}" data-actor-id="${actor.id}" data-weapon-type="${weaponType}" data-weapon-name="${weaponData.name}" data-weapon-damage="${weaponData.damage}" data-is-critical="${isCritical}" style="margin-top: 0.5em; width: 100%;">
        <i class="fas fa-dice-d20"></i> ${buttonText}
      </button>`;
      
      // Find message content and append button
      const messageContent = html.find(".message-content");
      messageContent.append(damageButton);
      
      // Add click handler for character damage
      html.find(".damage-roll-button.character").click(async (event) => {
        event.preventDefault();
        await _rollCharacterDamage(event);
      });
    }
  }
}

/**
 * Handle damage button creation for adversaries (NPCs)
 */
function _handleAdversaryDamageButton(message, html, actor, flavor) {
  let weaponData = null;
  let weaponType = null;
  
  // Check if the flavor contains a weapon name that matches actor's attacks
  const primaryAttack = actor.system["weapon-main"];
  const secondaryAttack = actor.system["weapon-off"];
  
  if (primaryAttack?.name && flavor.includes(primaryAttack.name)) {
    weaponData = primaryAttack;
    weaponType = "primary";
  } else if (secondaryAttack?.name && flavor.includes(secondaryAttack.name)) {
    weaponData = secondaryAttack;
    weaponType = "secondary";
  }
  
  // Check for existing button
  const existingButton = html.find(".damage-roll-button").length;
  
  // If we found a matching attack and it has damage defined
  if (weaponData && weaponData.damage && !existingButton) {
    // Check if this appears to be a damage roll (exclude damage rolls)
    const isDamageRoll = flavor.includes("Damage") || 
                        flavor.includes("damage") || 
                        flavor.toLowerCase().includes("- damage") ||
                        flavor.includes("Critical Damage") ||
                        flavor.includes("critical damage");
    
    // Check if this appears to be an attack roll (NOT a damage roll)
    const isAttackRoll = flavor.includes(weaponData.name) && !isDamageRoll;
    
    if (isAttackRoll) {
      // Check if this was a critical success (NPCs crit on natural 20)
      const isCritical = flavor.includes("Critical Success");
      
      // Add damage button to the message
      const buttonText = isCritical ? "Critical Damage" : "Damage";
      const damageButton = `<button class="damage-roll-button adversary ${isCritical ? 'critical' : ''}" data-actor-id="${actor.id}" data-weapon-type="${weaponType}" data-weapon-name="${weaponData.name}" data-weapon-damage="${weaponData.damage}" data-is-critical="${isCritical}" style="margin-top: 0.5em; width: 100%;">
        <i class="fas fa-dice-d20"></i> ${buttonText}
      </button>`;
      
      // Find message content and append button
      const messageContent = html.find(".message-content");
      messageContent.append(damageButton);
      
      // Add click handler for adversary damage
      html.find(".damage-roll-button.adversary").click(async (event) => {
        event.preventDefault();
        await _rollAdversaryDamage(event);
      });
    }
  }
}

/**
 * Roll damage for player characters (uses proficiency)
 */
async function _rollCharacterDamage(event) {
  const button = event.currentTarget;
  const actorId = button.dataset.actorId;
  const weaponType = button.dataset.weaponType;
  const weaponName = button.dataset.weaponName;
  const weaponDamage = button.dataset.weaponDamage;
  const isCritical = button.dataset.isCritical === "true";
  
  const actor = game.actors.get(actorId);
  if (!actor) {
    console.error("Daggerheart | Actor not found for character damage roll");
    return;
  }
  
  // Get proficiency value
  const proficiency = Math.max(1, parseInt(actor.system.proficiency?.value) || 1);
  
  // Parse dice notation
  const diceMatch = weaponDamage.match(/^(\d*)d(\d+)(.*)$/i);
  let rollValue;
  let flavorText = `${weaponName} - Damage`;
  
  if (diceMatch) {
    const diceCount = parseInt(diceMatch[1]) || proficiency; // Use proficiency if no count specified
    const dieType = parseInt(diceMatch[2]);
    const modifier = diceMatch[3] || "";
    
    if (isCritical) {
      // Critical damage: max value + normal roll
      const maxDamage = diceCount * dieType;
      rollValue = `${maxDamage} + ${diceCount}d${dieType}${modifier}`;
      flavorText = `${weaponName} - Critical Damage!`;
    } else {
      // Normal damage
      rollValue = `${diceCount}d${dieType}${modifier}`;
    }
  } else {
    // Fallback for non-standard notation
    rollValue = weaponDamage;
  }
  
  // Create and send the damage roll
  const roll = new Roll(rollValue);
  await roll.evaluate();
  
  await roll.toMessage({
    flavor: flavorText,
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    rollMode: "roll"
  });
}

/**
 * Roll damage for adversaries (uses raw damage formula, no proficiency)
 */
async function _rollAdversaryDamage(event) {
  const button = event.currentTarget;
  const actorId = button.dataset.actorId;
  const weaponType = button.dataset.weaponType;
  const weaponName = button.dataset.weaponName;
  const weaponDamage = button.dataset.weaponDamage;
  const isCritical = button.dataset.isCritical === "true";
  
  const actor = game.actors.get(actorId);
  if (!actor) {
    console.error("Daggerheart | Actor not found for adversary damage roll");
    return;
  }
  
  let rollValue;
  let flavorText = `${weaponName} - Damage`;
  
  if (isCritical) {
    // Parse the damage formula to calculate critical damage
    rollValue = _calculateAdversaryCriticalDamage(weaponDamage);
    flavorText = `${weaponName} - Critical Damage!`;
  } else {
    // Normal damage - use the formula as-is
    rollValue = weaponDamage;
  }
  
  // Create and send the damage roll
  const roll = new Roll(rollValue);
  await roll.evaluate();
  
  await roll.toMessage({
    flavor: flavorText,
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    rollMode: "roll"
  });
}

/**
 * Calculate critical damage for adversaries
 * Example: "3d12+10" becomes "36 + 3d12+10" (36 is max of 3d12)
 */
function _calculateAdversaryCriticalDamage(damageFormula) {
  // Find all dice terms in the formula
  const dicePattern = /(\d*)d(\d+)/gi;
  let criticalFormula = damageFormula;
  let maxDamageTotal = 0;
  
  // Replace each dice term with its maximum value
  criticalFormula = criticalFormula.replace(dicePattern, (match, count, sides) => {
    const diceCount = parseInt(count) || 1;
    const dieSides = parseInt(sides);
    const maxValue = diceCount * dieSides;
    maxDamageTotal += maxValue;
    return match; // Keep original for the normal roll part
  });
  
  // If we found dice in the formula, create critical damage
  if (maxDamageTotal > 0) {
    return `${maxDamageTotal} + ${damageFormula}`;
  } else {
    // No dice found, just return the original formula
    return damageFormula;
  }
}

/**
 * Hook to store weapon data in attack roll messages for later use
 */
Hooks.on("preCreateChatMessage", (message, data, options, userId) => {
  // This hook is no longer needed since we're storing roll type data in the message flags
  // in the roll methods themselves. Keeping it for potential future use.
});

/**
 * Adds the actor template context menu.
 */
Hooks.on("getActorDirectoryEntryContext", (html, options) => {

  // set template
  options.push({
    name: game.i18n.localize("SIMPLE.DefineTemplate"),
    icon: '<i class="fas fa-stamp"></i>',
    condition: li => {
      const actor = game.actors.get(li.data("documentId"));
      return !actor.isTemplate;
    },
    callback: li => {
      const actor = game.actors.get(li.data("documentId"));
      actor.setFlag("daggerheart", "isTemplate", true);
    }
  });

  // unset template
  options.push({
    name: game.i18n.localize("SIMPLE.UnsetTemplate"),
    icon: '<i class="fas fa-times"></i>',
    condition: li => {
      const actor = game.actors.get(li.data("documentId"));
      return actor.isTemplate;
    },
    callback: li => {
      const actor = game.actors.get(li.data("documentId"));
      actor.setFlag("daggerheart", "isTemplate", false);
    }
  });
});

/**
 * Adds the item template context menu.
 */
Hooks.on("getItemDirectoryEntryContext", (html, options) => {

  // set template
  options.push({
    name: game.i18n.localize("SIMPLE.DefineTemplate"),
    icon: '<i class="fas fa-stamp"></i>',
    condition: li => {
      const item = game.items.get(li.data("documentId"));
      return !item.isTemplate;
    },
    callback: li => {
      const item = game.items.get(li.data("documentId"));
      item.setFlag("daggerheart", "isTemplate", true);
    }
  });

  // unset template
  options.push({
    name: game.i18n.localize("SIMPLE.UnsetTemplate"),
    icon: '<i class="fas fa-times"></i>',
    condition: li => {
      const item = game.items.get(li.data("documentId"));
      return item.isTemplate;
    },
    callback: li => {
      const item = game.items.get(li.data("documentId"));
      item.setFlag("daggerheart", "isTemplate", false);
    }
  });
});