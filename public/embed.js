/**
 * Convy Embed Loader Script
 * Version: 2.0.0 (Premium)
 * Description: Production-ready survey embed widget with Web Components and Lazy Loading.
 */
(function () {
  if (window.ConvyEmbedInitialized) return;
  window.ConvyEmbedInitialized = true;

  // 1. Determine base URL from the script source
  let baseUrl = "http://localhost:3000";
  try {
    const script = document.currentScript;
    if (script && script.src) {
      baseUrl = new URL(script.src).origin;
    }
  } catch (e) {
    console.warn("Convy: Failed to determine base URL, using default.");
  }
  const CONVY_BASE_URL = baseUrl;

  /**
   * Safe HTML Escaping
   */
  const sanitize = (str) => {
    if (!str) return "";
    return str.replace(
      /[<>"'/]/g,
      (m) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
          "/": "&#47;",
        })[m],
    );
  };

  /**
   * <convy-widget> Custom Element
   */
  class ConvyWidget extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._isVisible = false;
      this._loaded = false;
    }

    connectedCallback() {
      this.render();
      this.setupObserver();
    }

    static get observedAttributes() {
      return ["survey-id", "type", "color", "text", "position"];
    }

    attributeChangedCallback() {
      if (this._loaded) this.render();
    }

    setupObserver() {
      if (typeof IntersectionObserver === "undefined") {
        this.loadWidget();
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            this.loadWidget();
            observer.disconnect();
          }
        },
        { rootMargin: "200px" },
      );

      observer.observe(this);
    }

    loadWidget() {
      if (this._isVisible) return;
      this._isVisible = true;
      this.renderContent();
    }

    render() {
      const type = this.getAttribute("type") || "inline";
      const color = sanitize(this.getAttribute("color") || "#4F46E5");
      const position = this.getAttribute("position") || "right";

      this._shadow.innerHTML = `
        <style>
          :host { display: block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          .convy-loading {
            display: flex; align-items: center; justify-content: center;
            width: 100%; height: 600px; background: #f9fafb; border-radius: 8px;
            color: #6b7280; font-size: 14px;
          }
          .spinner {
            width: 24px; height: 24px; border: 2px solid #e5e7eb;
            border-top-color: ${color}; border-radius: 50%;
            animation: spin 0.8s linear infinite; margin-right: 12px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }

          /* Trigger Styles */
          .trigger {
            position: fixed; bottom: 24px; ${position}: 24px;
            width: 60px; height: 60px; border-radius: 50%;
            background: ${color}; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s; z-index: 999998; border: none;
          }
          .trigger:hover { transform: scale(1.1); }
          .trigger svg { width: 28px; height: 28px; fill: white; }

          /* Modal/Overlay Styles */
          .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); display: none; z-index: 999999;
            align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s;
          }
          .modal-overlay.open { display: flex; opacity: 1; }
          
          .modal {
            width: 90%; max-width: 800px; height: 80vh; background: white;
            border-radius: 12px; overflow: hidden; position: relative;
            transform: translateY(20px); transition: transform 0.3s;
          }
          .modal-overlay.open .modal { transform: translateY(0); }

          /* Popover Styles */
          .popover {
            position: fixed; bottom: 100px; ${position}: 24px;
            width: 400px; height: 600px; background: white;
            border-radius: 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.2);
            display: none; flex-direction: column; overflow: hidden;
            z-index: 999999; opacity: 0; transform: translateY(20px);
            transition: opacity 0.3s, transform 0.3s;
          }
          .popover.open { display: flex; opacity: 1; transform: translateY(0); }

          /* Side Tab Styles */
          .tab {
            position: fixed; top: 50%; ${position}: 0;
            transform: translateY(-50%) ${position === "right" ? "rotate(-90deg) translateY(-100%)" : "rotate(90deg) translateY(-100%)"};
            transform-origin: ${position === "right" ? "bottom right" : "bottom left"};
            background: ${color}; color: white; padding: 12px 24px;
            border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold;
            z-index: 999998; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); border: none;
          }

          .close-btn {
            position: absolute; top: 12px; right: 12px; width: 32px; height: 32px;
            background: white; border-radius: 50%; border: none; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1); font-size: 20px; z-index: 10;
          }

          iframe { width: 100%; height: 100%; border: 0; }
        </style>
        <div id="container"></div>
      `;
      this._loaded = true;
      if (this._isVisible) this.renderContent();
    }

    renderContent() {
      const surveyId = sanitize(this.getAttribute("survey-id"));
      const type = this.getAttribute("type") || "inline";
      const subType = this.getAttribute("position") || "right";
      const text = sanitize(this.getAttribute("text") || "Take Survey");
      const url = `${CONVY_BASE_URL}/s/${surveyId}`;

      const container = this._shadow.getElementById("container");
      if (!container) return;

      if (type === "inline") {
        container.innerHTML = `
          <div class="convy-loading"><div class="spinner"></div>Loading Survey...</div>
          <iframe src="${url}" title="Convy Survey" allow="microphone; camera; autoplay" 
            onload="this.previousElementSibling.style.display='none'"></iframe>
        `;
      } else if (type === "popover") {
        container.innerHTML = `
          <button class="trigger" aria-label="Open Survey" aria-expanded="false" aria-controls="modal">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </button>
          <div class="popover" id="modal" role="dialog" aria-modal="true">
            <iframe src="${url}" title="Convy Survey"></iframe>
          </div>
        `;
        const trigger = this._shadow.querySelector(".trigger");
        const popover = this._shadow.querySelector(".popover");
        trigger.onclick = () => {
          const isOpen = popover.classList.toggle("open");
          trigger.setAttribute("aria-expanded", isOpen);
        };
      } else if (type === "side-tab") {
        container.innerHTML = `
          <button class="tab">${text}</button>
          <div class="modal-overlay" role="dialog" aria-modal="true">
            <div class="modal">
              <button class="close-btn" aria-label="Close">&times;</button>
              <iframe src="${url}" title="Convy Survey"></iframe>
            </div>
          </div>
        `;
        const tab = this._shadow.querySelector(".tab");
        const overlay = this._shadow.querySelector(".modal-overlay");
        const close = this._shadow.querySelector(".close-btn");
        tab.onclick = () => overlay.classList.add("open");
        close.onclick = () => overlay.classList.remove("open");
        overlay.onclick = (e) => {
          if (e.target === overlay) overlay.classList.remove("open");
        };
      }
    }

    close() {
      const modal = this._shadow.querySelector(".popover, .modal-overlay");
      if (modal) modal.classList.remove("open");
    }
  }

  // Define the custom element
  customElements.define("convy-widget", ConvyWidget);

  // Handle postMessage communication
  window.addEventListener("message", (event) => {
    if (event.origin !== CONVY_BASE_URL) return;

    if (event.data && event.data.type === "convy-survey-completed") {
      const widgets = document.querySelectorAll("convy-widget");
      widgets.forEach((w) => {
        if (w.getAttribute("survey-id") === event.data.surveyId) {
          setTimeout(() => w.close(), 2000);
        }
      });
    }
  });
})();
