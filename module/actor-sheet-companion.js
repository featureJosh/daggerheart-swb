import { EntitySheetHelper } from "./helper.js";
import { ATTRIBUTE_TYPES } from "./constants.js";
import { SheetTracker } from "./sheet-tracker.js";
import { SimpleActorSheet } from "./actor-sheet.js";

/**
* Extend the basic ActorSheet with some very simple modifications
* @extends {ActorSheet}
*/
export class CompanionActorSheet extends SimpleActorSheet {
  
  /** @inheritdoc */
  static get defaultOptions() {
    // Calculate responsive dimensions based on screen size
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    
    // Calculate optimal height for NPC sheet (typically smaller than PC sheet)
    const maxHeight = Math.floor(screenHeight * 0.85);
    const minHeight = 500; // Minimum usable height for NPC
    const preferredHeight = 840; // Ideal height for larger screens
    
    const height = Math.max(minHeight, Math.min(preferredHeight, maxHeight));
    
    // Calculate width for NPC sheet
    const maxWidth = Math.floor(screenWidth * 0.9);
    const minWidth = 690; // Maintain minimum width for usability
    const preferredWidth = 650; // Standard width for NPC
    
    const width = Math.max(minWidth, Math.min(preferredWidth, maxWidth));
    
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["daggerheart", "sheet", "companion"],
      template: "systems/daggerheart/templates/actor-sheet-companion.html",
      width: width,
      height: height,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "experience"}],
      scrollY: [".biography", ".items", ".attributes"],
      dragDrop: [
        { dragSelector: ".item-list .item", dropSelector: null },
        { dragSelector: ".card", dropSelector: ".domains-section" }
      ]
    });
  }
  
  /* -------------------------------------------- */
  
  /** @inheritdoc */
  async getData(options) {
    const context = await super.getData(options);
    EntitySheetHelper.getAttributeData(context.data);
    context.shorthand = !!game.settings.get("daggerheart", "macroShorthand");
    context.systemData = context.data.system;
    context.domains = this.actor.system.domains;
    context.dtypes = ATTRIBUTE_TYPES;
    
    // htmlFields
    context.biographyHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.systemData.biography, {
      secrets: this.document.isOwner,
      async: true
    });
    context.inventoryHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.systemData.inventory, {
      secrets: this.document.isOwner,
      async: true
    });

    // Enrich item descriptions
    for (let item of context.data.items) {
      item.system.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
        secrets: this.document.isOwner,
        async: true
      });
    }
    
    context.actor = this.actor; // Add this line to include the actor object in the context
    
    const imageLink = context.data.img;
    context.imageStyle = `background: url(${imageLink});`;
    
    // Check if NPC is dying/dead (hit points maxed out)
    const health = context.systemData.health;
    context.isDying = health && health.value === health.max && health.max > 0;
    
    return context;
  }
  
  /* -------------------------------------------- */
  
  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Initialize Sheet Tracker for NPCs
    if (!this.sheetTracker) {
      this.sheetTracker = new SheetTracker(this);
    }
    // Always initialize on re-render to recreate the DOM
    this.sheetTracker.initialize();
    
    // Everything below here is only needed if the sheet is editable
    if ( !this.isEditable ) return;
    
    // Attribute Management
    html.find(".attributes").on("click", ".attribute-control", EntitySheetHelper.onClickAttributeControl.bind(this));
    html.find(".groups").on("click", ".group-control", EntitySheetHelper.onClickAttributeGroupControl.bind(this));
    html.find(".attributes").on("click", "a.attribute-roll", EntitySheetHelper.onAttributeRoll.bind(this));
    
    // Item Controls
    html.find(".item-control").click(this._onItemControl.bind(this));
    html.find(".items .rollable").on("click", this._onItemRoll.bind(this));    
    
    // Add draggable for Macro creation
    html.find(".attributes a.attribute-roll").each((i, a) => {
      a.setAttribute("draggable", true);
      a.addEventListener("dragstart", ev => {
        let dragData = ev.currentTarget.dataset;
        ev.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      }, false);
    });
    
    let el = html.find(".input-wrap .input");
    let widthMachine = html.find(".input-wrap .width-machine");
    el.on("keyup", () => {
      widthMachine.html(el.val());
    });
    
    function calcHeight(value) {
      let numberOfLineBreaks = (value.match(/\n/g) || []).length;
      // min-height + lines x line-height + padding + border
      let newHeight = 20 + numberOfLineBreaks * 20 + 12 + 2;
      return newHeight;
    }
    
    let textarea = html.find(".resize-ta");
    textarea.on("keyup", () => {
      textarea.css("height", calcHeight(textarea.val()) + "px");
    });
    
  }
  
  /* -------------------------------------------- */
  
  /**
  * Handle click events for Item control buttons within the Actor Sheet
  * @param event
  * @private
  */
  async _onItemControl(event) {
    event.preventDefault();
    
    // Obtain event data
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.actor.items.get(li?.dataset.itemId);
    const action = button.dataset.action;

    // If the clicked element is an IMG with data-action="edit" (the item's image)
    if (item && action === "edit" && button.tagName === 'IMG' && button.classList.contains('item-control')) {
      const itemData = item.system;
      const description = await TextEditor.enrichHTML(itemData.description, {secrets: this.actor.isOwner, async: true});
      const chatCard = `
      <div class="item-card-chat" data-item-id="${item.id}" data-actor-id="${this.actor.id}">
          <div class="card-image-container" style="background-image: url('${item.img}')">
              <div class="card-header-text">
                  <h3>${item.name}</h3>
              </div>
          </div>
          <div class="card-content">
              <div class="card-subtitle">
                  <span>${itemData.category || ''} - ${itemData.rarity || ''}</span>
              </div>
              <div class="card-description">
                  ${description}
              </div>
          </div>
      </div>
      `;

      ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: chatCard
      });
      return; // Done, don't proceed to open edit sheet
    }
    
    // Handle different actions
    switch ( button.dataset.action ) {
      case "create":
      const cls = getDocumentClass("Item");
      return cls.create({name: game.i18n.localize("SIMPLE.ItemNew"), type: "item"}, {parent: this.actor});
      case "edit": 
        if (item) return item.sheet.render(true);
        break;
      case "delete":
        if (item) return item.delete();
        break;
    }
  }
  
  /* -------------------------------------------- */
  
  /**
  * Listen for roll buttons on items.
  * @param {MouseEvent} event    The originating left click event
  */
  async _onItemRoll(event) {
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.items.get(li.data("itemId"));
    
    // Use the rollHandler for consistent roll handling
    await game.daggerheart.rollHandler.quickRoll(button.data('roll'), {
      flavor: `<p class="roll-flavor-line"><b>${item.name}</b> - ${button.text()}</p>`,
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    });
  }

  /**
   * Handle crit results, depending on roll.
   * @param {{isCrit}} config 
   */
  async handleNPCResult({isCrit}) {
    if (isCrit) {
      await this._applyCriticalSuccess();
    }
  }
  
  /* -------------------------------------------- */
  
  async _rollTrait(traitName, traitValue) {
    const traitNamePrint = traitName.charAt(0).toUpperCase() + traitName.slice(1);
    const title = `Roll for ${traitNamePrint}`;
    
    // For NPCs, we'll call for an npc dialog roll
    await game.daggerheart.rollHandler.npcRollWithDialog({title, traitValue, actor: this.actor});
  }
  
  /** @inheritdoc */
  _getSubmitData(updateData) {
    let formData = super._getSubmitData(updateData);
    if (this.actor.type === "npc") {
      formData["system.isNPC"] = true;
    }
    return formData;
  }
}