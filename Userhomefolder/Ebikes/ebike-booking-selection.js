(function () {
    const PRODUCT_STORAGE_KEY = "ecodrive_product_catalog";
    const COLOR_VARIANT_STORAGE_KEY = "ecodrive_color_variant_availability_v1";
    const API_BASE = String(
        localStorage.getItem("ecodrive_api_base")
        || localStorage.getItem("ecodrive_kyc_api_base")
        || "http://127.0.0.1:5050"
    )
        .trim()
        .replace(/\/+$/, "");

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function parsePriceNumber(text) {
        if (!text) return 0;
        const match = String(text).match(/[\d,.]+/);
        if (!match) return 0;
        const value = Number(match[0].replace(/,/g, ""));
        return Number.isFinite(value) ? value : 0;
    }

    function formatPesoText(amount) {
        return "Price: "
            + String.fromCharCode(8369)
            + " "
            + Number(amount || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
    }

    function readCatalogFromStorage() {
        const parsed = safeParse(localStorage.getItem(PRODUCT_STORAGE_KEY));
        return Array.isArray(parsed) ? parsed : [];
    }

    function saveCatalogToStorage(catalog) {
        localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(catalog));
    }

    function normalizeModelKey(value) {
        return normalizeText(value);
    }

    function normalizeColorKey(value) {
        return normalizeText(value).replace(/\s+/g, "-");
    }

    function readColorVariantState() {
        const parsed = safeParse(localStorage.getItem(COLOR_VARIANT_STORAGE_KEY));
        if (!parsed || typeof parsed !== "object") {
            return {};
        }
        return parsed;
    }

    function getCurrentModelName() {
        const modelEl = document.querySelector(".model-title");
        if (!modelEl) {
            return "";
        }
        return String(modelEl.textContent || "").replace(/^MODEL:\s*/i, "").trim();
    }

    function getDotClassColorToken(dot) {
        const tokens = String(dot && dot.className || "")
            .split(/\s+/)
            .map(function (token) {
                return token.trim();
            })
            .filter(Boolean);

        for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i].toLowerCase();
            if (token !== "dot" && token !== "active") {
                return tokens[i];
            }
        }
        return "";
    }

    function getDotColorKey(dot, index) {
        const dataColor = String(dot && dot.getAttribute("data-color") || "").trim();
        const ariaLabel = String(dot && dot.getAttribute("aria-label") || "").replace(/\bcolor\b/ig, "").trim();
        const classToken = getDotClassColorToken(dot);
        const fallback = "Color " + String(Number(index) + 1);
        return normalizeColorKey(dataColor || ariaLabel || classToken || fallback);
    }

    function setBookingAvailability(isAvailable) {
        const bookBtn = document.querySelector(".check-btn");
        if (!bookBtn) {
            return;
        }

        const allow = Boolean(isAvailable);
        const originalText = String(bookBtn.getAttribute("data-original-text") || bookBtn.textContent || "Book Now").trim() || "Book Now";
        bookBtn.setAttribute("data-original-text", originalText);

        bookBtn.disabled = !allow;
        bookBtn.style.opacity = allow ? "" : "0.65";
        bookBtn.style.pointerEvents = allow ? "" : "none";
        bookBtn.textContent = allow ? originalText : "Unavailable";
    }

    function setColorAvailabilityMessage(message) {
        const colorPicker = document.querySelector(".color-picker");
        const priceRow = document.querySelector(".price-row");
        const host = colorPicker || priceRow;
        if (!host) {
            return;
        }

        const noteId = "color-availability-note";
        let note = document.getElementById(noteId);
        if (!message) {
            if (note) {
                note.remove();
            }
            return;
        }

        if (!note) {
            note = document.createElement("p");
            note.id = noteId;
            note.style.marginTop = "8px";
            note.style.fontSize = "13px";
            note.style.fontWeight = "600";
            note.style.color = "#9b1c1c";
            host.appendChild(note);
        }
        note.textContent = message;
    }

    function applyColorAvailability() {
        const modelName = getCurrentModelName();
        const modelKey = normalizeModelKey(modelName);
        if (!modelKey) {
            return;
        }

        const state = readColorVariantState();
        const variants = Array.isArray(state[modelKey]) ? state[modelKey] : [];
        if (!variants.length) {
            setBookingAvailability(true);
            setColorAvailabilityMessage("");
            return;
        }

        const availability = {};
        variants.forEach(function (variant, index) {
            const key = normalizeColorKey(variant && (variant.key || variant.label || variant.name) || ("Color " + String(index + 1)));
            if (!key) {
                return;
            }
            availability[key] = !(variant && (variant.isActive === false || variant.isActive === 0 || variant.isActive === "0" || String(variant.isActive).toLowerCase() === "false"));
        });

        const dots = Array.from(document.querySelectorAll(".dot"));
        if (!dots.length) {
            return;
        }

        let visibleCount = 0;
        dots.forEach(function (dot, index) {
            const colorKey = getDotColorKey(dot, index);
            const isAllowed = Object.prototype.hasOwnProperty.call(availability, colorKey) ? availability[colorKey] : true;
            dot.disabled = !isAllowed;
            dot.style.display = isAllowed ? "" : "none";
            dot.setAttribute("aria-hidden", String(!isAllowed));
            if (isAllowed) {
                visibleCount += 1;
            } else {
                dot.classList.remove("active");
            }
        });

        if (visibleCount > 0) {
            const activeDot = document.querySelector(".dot.active:not([style*='display: none'])");
            if (!activeDot) {
                const firstVisible = dots.find(function (dot) {
                    return dot.style.display !== "none" && !dot.disabled;
                });
                if (firstVisible) {
                    firstVisible.click();
                }
            }
            setBookingAvailability(true);
            setColorAvailabilityMessage("");
            return;
        }

        setBookingAvailability(false);
        setColorAvailabilityMessage("This model currently has no available color.");
    }

    async function fetchCatalogFromApi() {
        try {
            const response = await fetch(getApiUrl("/api/products"), {
                method: "GET"
            });

            if (!response.ok) {
                return [];
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            if (!payload || payload.success !== true || !Array.isArray(payload.products)) {
                return [];
            }

            saveCatalogToStorage(payload.products);
            return payload.products;
        } catch (_error) {
            return [];
        }
    }

    function findProductByModel(catalog, model) {
        const target = normalizeText(model);
        if (!target) {
            return null;
        }

        const list = Array.isArray(catalog) ? catalog : [];
        let partialMatch = null;

        for (let i = 0; i < list.length; i += 1) {
            const item = list[i];
            if (!item || typeof item !== "object") {
                continue;
            }
            const modelText = normalizeText(item.model);
            if (!modelText) {
                continue;
            }
            if (modelText === target) {
                return item;
            }
            if (!partialMatch && (modelText.includes(target) || target.includes(modelText))) {
                partialMatch = item;
            }
        }

        return partialMatch;
    }

    async function resolveProduct(model) {
        const localMatch = findProductByModel(readCatalogFromStorage(), model);
        if (localMatch) {
            return localMatch;
        }

        const apiCatalog = await fetchCatalogFromApi();
        return findProductByModel(apiCatalog, model);
    }

    function getSubtitleByBikeId() {
        const match = window.location.pathname.match(/ebike(\d+)\.0\.html/i);
        const bikeId = match ? Number(match[1]) : 0;
        if (bikeId >= 1 && bikeId <= 8) return "2-Wheel";
        if (bikeId >= 9 && bikeId <= 12) return "3-Wheel";
        if (bikeId >= 13 && bikeId <= 16) return "4-Wheel";
        return "E-Bike";
    }

    function applyBikeImageBorder() {
        const bikeImage = document.getElementById("bike-image");
        if (!bikeImage) {
            return;
        }
        bikeImage.style.border = "2px solid #3652a2";
        bikeImage.style.borderRadius = "14px";
        bikeImage.style.background = "#ffffff";
        bikeImage.style.padding = "6px";
    }

    async function hydratePriceDisplay() {
        const modelEl = document.querySelector(".model-title");
        const priceEl = document.querySelector(".price");
        if (!modelEl || !priceEl) {
            return;
        }

        const model = String(modelEl.textContent || "").replace(/^MODEL:\s*/i, "").trim();
        if (!model) {
            return;
        }

        const product = await resolveProduct(model);
        const nextPrice = Number(product && product.price);
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
            return;
        }

        priceEl.textContent = formatPesoText(nextPrice);
    }

    async function buildSelection() {
        const modelEl = document.querySelector(".model-title");
        const priceEl = document.querySelector(".price");
        const imageEl = document.getElementById("bike-image");
        const activeDot = document.querySelector(".dot.active");

        const modelText = modelEl ? modelEl.textContent : "";
        const model = modelText.replace(/^MODEL:\s*/i, "").trim() || "Ecodrive E-Bike";
        const displayedPrice = parsePriceNumber(priceEl ? priceEl.textContent : "");
        const product = await resolveProduct(model);
        const latestPrice = Number(product && product.price);
        const total = Number.isFinite(latestPrice) && latestPrice > 0
            ? Number(latestPrice.toFixed(2))
            : displayedPrice;

        const selectedImage =
            (activeDot && activeDot.dataset && activeDot.dataset.image) ||
            (imageEl ? imageEl.getAttribute("src") : "") ||
            "../image 1.png";

        return {
            model: model,
            total: total,
            image: selectedImage,
            bikeImage: selectedImage,
            subtitle: String(product && product.category || getSubtitleByBikeId())
        };
    }

    async function persistSelection() {
        const selection = await buildSelection();
        localStorage.setItem("ecodrive_checkout_selection", JSON.stringify(selection));
        localStorage.setItem("ecodrive_selected_bike", JSON.stringify(selection));
        localStorage.setItem("selectedBike", JSON.stringify(selection));
    }

    document.addEventListener(
        "click",
        async function (event) {
            const button = event.target.closest(".check-btn");
            if (!button) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            await persistSelection();

            const target = button.getAttribute("data-booking-url") || "../payment/booking.html";
            window.location.href = target;
        },
        true
    );

    void hydratePriceDisplay();
    applyBikeImageBorder();
    applyColorAvailability();

    window.addEventListener("storage", function (event) {
        if (event.key === COLOR_VARIANT_STORAGE_KEY) {
            applyColorAvailability();
        }
    });
})();
