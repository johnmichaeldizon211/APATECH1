(function (global) {
    "use strict";

    var DEFAULT_BIKE_CATALOG = [
        { model: "BLITZ 2000", price: 68000, category: "2-Wheel", aliases: ["blitz 2000"] },
        { model: "BLITZ 1200", price: 45000, category: "2-Wheel", aliases: ["blitz 1200"] },
        { model: "FUN 1500 FI", price: 74000, category: "2-Wheel", aliases: ["fun 1500 fi", "fun 1500"] },
        { model: "CANDY 800", price: 58000, category: "2-Wheel", aliases: ["candy 800"] },
        { model: "BLITZ 200R", price: 74000, category: "2-Wheel", aliases: ["blitz 200r"] },
        { model: "TRAVELLER 1500", price: 79000, category: "2-Wheel", aliases: ["traveller 1500", "traveler 1500"] },
        { model: "ECONO 500 MP", price: 51500, category: "2-Wheel", aliases: ["econo 500 mp"] },
        { model: "ECONO 350 MINI-II", price: 58000, category: "2-Wheel", aliases: ["econo 350 mini ii", "econo 350 mini", "mini ii"] },
        { model: "ECARGO 100", price: 72500, category: "3-Wheel", aliases: ["ecargo 100", "e cargo 100"] },
        { model: "ECONO 650 MP", price: 65000, category: "3-Wheel", aliases: ["econo 650 mp"] },
        { model: "ECAB 100V V2", price: 51500, category: "3-Wheel", aliases: ["ecab 100v v2", "ecab 1000 ii", "ecab v2"] },
        { model: "ECONO 800 MP II", price: 67000, category: "3-Wheel", aliases: ["econo 800 mp ii", "econo 800 mp 2"] },
        { model: "E-CARGO 800", price: 205000, category: "4-Wheel", aliases: ["e cargo 800", "ecargo 800"] },
        { model: "E-CAB MAX 1500", price: 130000, category: "4-Wheel", aliases: ["e cab max 1500", "ecab max 1500", "traveler 1500 4 wheel", "traveller 1500 4 wheel"] },
        { model: "E-CAB 1000", price: 75000, category: "4-Wheel", aliases: ["e cab 1000", "ecab 1000"] },
        { model: "ECONO 800 MP", price: 100000, category: "4-Wheel", aliases: ["econo 800 mp"] }
    ];

    var PRODUCT_STORAGE_KEY = "ecodrive_product_catalog";
    var BOOKING_KEYS = ["ecodrive_bookings", "ecodrive_orders", "orders"];
    var CURRENT_USER_KEY = "ecodrive_current_user_email";
    var LEGACY_CHAT_STORAGE_KEY = "ecodrive_chat_messages_v1";
    var SCOPED_CHAT_STORAGE_PREFIX = "ecodrive_chat_messages_v2::";
    var API_BASE = String(
        localStorage.getItem("ecodrive_api_base")
        || localStorage.getItem("ecodrive_kyc_api_base")
        || "http://127.0.0.1:5050"
    )
        .trim()
        .replace(/\/+$/, "");

    var liveCatalog = DEFAULT_BIKE_CATALOG.slice();
    var defaultAliasMap = buildDefaultAliasMap();

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

    function getScopedChatStorageKey() {
        var email = String(getCurrentUserEmail() || "").trim().toLowerCase();
        var ownerId = email
            ? email.replace(/[^a-z0-9@._-]+/g, "_")
            : "guest";
        return SCOPED_CHAT_STORAGE_PREFIX + ownerId;
    }

    function mapChatStorageKey(key) {
        var raw = String(key || "");
        if (raw === LEGACY_CHAT_STORAGE_KEY) {
            return getScopedChatStorageKey();
        }
        return raw;
    }

    function patchLegacyChatStorageMapping() {
        if (!global || !global.localStorage) {
            return;
        }
        if (global.__ecodriveChatScopedPatchApplied) {
            return;
        }

        try {
            var storageProto = Object.getPrototypeOf(global.localStorage);
            if (!storageProto || storageProto.__ecodriveChatScopedPatchApplied) {
                global.__ecodriveChatScopedPatchApplied = true;
                return;
            }

            var originalGetItem = storageProto.getItem;
            var originalSetItem = storageProto.setItem;
            var originalRemoveItem = storageProto.removeItem;

            storageProto.getItem = function (key) {
                return originalGetItem.call(this, mapChatStorageKey(key));
            };

            storageProto.setItem = function (key, value) {
                return originalSetItem.call(this, mapChatStorageKey(key), value);
            };

            storageProto.removeItem = function (key) {
                return originalRemoveItem.call(this, mapChatStorageKey(key));
            };

            storageProto.__ecodriveChatScopedPatchApplied = true;
            global.__ecodriveChatScopedPatchApplied = true;
        } catch (_error) {
            // keep default storage methods if patching is blocked
        }
    }

    function getSuggestionQuestions() {
        return [
            "Ano available na 2-wheel models?",
            "Magkano ang BLITZ 2000?",
            "Ano payment options?",
            "Paano mag-book ng ebike?",
            "Ano status ng booking ko?",
            "Paano magpa-repair booking?"
        ];
    }

    function ensureChatEnhancerStyles() {
        if (!global.document || global.document.getElementById("ecodrive-chat-enhancer-style")) {
            return;
        }

        var style = global.document.createElement("style");
        style.id = "ecodrive-chat-enhancer-style";
        style.textContent = [
            ".chat-clear-btn{margin-left:8px;border:1.5px solid #b13232;background:#fff5f5;color:#9f2222;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;}",
            ".chat-suggestions{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;}",
            ".chat-suggestion-btn{border:1.5px solid #3557a1;background:#f4f7ff;color:#123f79;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;}",
            ".chat-suggestion-btn:hover{background:#e8eeff;}"
        ].join("");

        global.document.head.appendChild(style);
    }

    function injectChatEnhancements() {
        if (!global.document) {
            return;
        }

        var panel = global.document.getElementById("chat-panel");
        var header = panel ? panel.querySelector(".chat-header") : null;
        var body = panel ? panel.querySelector("#chat-body") : null;
        var form = panel ? panel.querySelector("#chat-form") : null;
        var input = panel ? panel.querySelector("#chat-input") : null;

        if (!(panel && header && body && form && input)) {
            return;
        }

        ensureChatEnhancerStyles();

        if (!header.querySelector(".chat-clear-btn")) {
            var clearBtn = global.document.createElement("button");
            clearBtn.type = "button";
            clearBtn.className = "chat-clear-btn";
            clearBtn.textContent = "Delete Chat";
            clearBtn.setAttribute("aria-label", "Delete chatbot conversation");

            clearBtn.addEventListener("click", function () {
                if (!global.confirm("Delete this chatbot conversation?")) {
                    return;
                }
                try {
                    global.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
                    global.localStorage.removeItem(getScopedChatStorageKey());
                } catch (_error) {
                    // ignore
                }
                if (global.location && typeof global.location.reload === "function") {
                    global.location.reload();
                }
            });

            var closeButton = header.querySelector("#chat-close, .chat-close, button[aria-label='Close chat']");
            if (closeButton && closeButton.parentNode === header) {
                header.insertBefore(clearBtn, closeButton);
            } else {
                header.appendChild(clearBtn);
            }
        }

        if (!panel.querySelector(".chat-suggestions")) {
            var suggestionWrap = global.document.createElement("div");
            suggestionWrap.className = "chat-suggestions";

            getSuggestionQuestions().forEach(function (question) {
                var chip = global.document.createElement("button");
                chip.type = "button";
                chip.className = "chat-suggestion-btn";
                chip.textContent = question;
                chip.addEventListener("click", function () {
                    input.value = question;
                    if (typeof form.requestSubmit === "function") {
                        form.requestSubmit();
                    } else {
                        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                    }
                });
                suggestionWrap.appendChild(chip);
            });

            panel.insertBefore(suggestionWrap, form);
        }
    }

    function setupChatEnhancer() {
        patchLegacyChatStorageMapping();
        if (!global.document) {
            return;
        }

        if (global.document.readyState === "loading") {
            global.document.addEventListener("DOMContentLoaded", injectChatEnhancements);
        } else {
            injectChatEnhancements();
        }
    }

    function normalizeCategory(value) {
        var raw = String(value || "").trim().toLowerCase();
        if (!raw) {
            return "Other";
        }
        if (raw.indexOf("2") >= 0) return "2-Wheel";
        if (raw.indexOf("3") >= 0) return "3-Wheel";
        if (raw.indexOf("4") >= 0) return "4-Wheel";
        return "Other";
    }

    function includesAny(text, keywords) {
        return keywords.some(function (keyword) {
            return text.indexOf(keyword) >= 0;
        });
    }

    function formatPeso(amount) {
        return String.fromCharCode(8369) + Number(amount || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function toPriceNumber(value) {
        var parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(parsed) || parsed < 0) {
            return 0;
        }
        return Number(parsed.toFixed(2));
    }

    function toIsActive(value) {
        if (value === false || value === 0 || value === "0") {
            return false;
        }
        var normalized = String(value === undefined || value === null ? "1" : value).trim().toLowerCase();
        if (normalized === "false" || normalized === "no") {
            return false;
        }
        return true;
    }

    function buildDefaultAliasMap() {
        var map = {};
        DEFAULT_BIKE_CATALOG.forEach(function (item) {
            var key = normalizeText(item && item.model);
            if (!key) return;
            map[key] = Array.isArray(item.aliases) ? item.aliases.slice() : [];
        });
        return map;
    }

    function dedupeAliasList(values) {
        var seen = {};
        var output = [];
        (values || []).forEach(function (entry) {
            var normalized = normalizeText(entry);
            if (!normalized || seen[normalized]) {
                return;
            }
            seen[normalized] = true;
            output.push(normalized);
        });
        return output;
    }

    function buildAliases(model, extraAliases) {
        var rawModel = String(model || "").trim();
        var aliasPool = [];

        aliasPool.push(rawModel);
        aliasPool.push(rawModel.replace(/-/g, " "));
        aliasPool.push(rawModel.replace(/\bii\b/ig, "2"));
        aliasPool.push(rawModel.replace(/\bv2\b/ig, "version 2"));
        aliasPool.push(rawModel.replace(/traveller/ig, "traveler"));
        aliasPool.push(rawModel.replace(/traveler/ig, "traveller"));

        if (Array.isArray(extraAliases)) {
            aliasPool = aliasPool.concat(extraAliases);
        }

        return dedupeAliasList(aliasPool);
    }

    function getCategoryOrder(category) {
        if (category === "2-Wheel") return 1;
        if (category === "3-Wheel") return 2;
        if (category === "4-Wheel") return 3;
        return 4;
    }

    function normalizeCatalogItem(source) {
        var item = source && typeof source === "object" ? source : {};
        var model = String(item.model || item.name || "").trim();
        if (!model) {
            return null;
        }

        var normalizedModelKey = normalizeText(model);
        var defaultAliases = defaultAliasMap[normalizedModelKey] || [];
        var sourceAliases = Array.isArray(item.aliases) ? item.aliases : [];

        return {
            model: model,
            price: toPriceNumber(item.price),
            category: normalizeCategory(item.category),
            aliases: buildAliases(model, defaultAliases.concat(sourceAliases))
        };
    }

    function buildCatalogFromProducts(input) {
        var list = Array.isArray(input) ? input : [];
        var normalized = [];

        list.forEach(function (row) {
            if (!row || typeof row !== "object") {
                return;
            }
            if (!toIsActive(row.isActive)) {
                return;
            }
            var next = normalizeCatalogItem(row);
            if (next) {
                normalized.push(next);
            }
        });

        if (!normalized.length) {
            return DEFAULT_BIKE_CATALOG.map(function (item) {
                return {
                    model: item.model,
                    price: toPriceNumber(item.price),
                    category: normalizeCategory(item.category),
                    aliases: buildAliases(item.model, item.aliases)
                };
            });
        }

        return normalized.sort(function (left, right) {
            var categoryDiff = getCategoryOrder(left.category) - getCategoryOrder(right.category);
            if (categoryDiff !== 0) {
                return categoryDiff;
            }
            return String(left.model).localeCompare(String(right.model));
        });
    }

    function readCatalogFromStorage() {
        var parsed = safeParse(localStorage.getItem(PRODUCT_STORAGE_KEY));
        if (!Array.isArray(parsed) || !parsed.length) {
            return null;
        }
        return buildCatalogFromProducts(parsed);
    }

    function getApiUrl(path) {
        return API_BASE ? API_BASE + path : path;
    }

    function refreshCatalogFromStorage() {
        var localCatalog = readCatalogFromStorage();
        if (localCatalog && localCatalog.length) {
            liveCatalog = localCatalog;
            return;
        }
        liveCatalog = buildCatalogFromProducts(DEFAULT_BIKE_CATALOG);
    }

    async function refreshCatalogFromApi() {
        if (typeof fetch !== "function") {
            return;
        }

        try {
            var response = await fetch(getApiUrl("/api/products"), { method: "GET" });
            if (!response.ok) {
                return;
            }

            var payload = await response.json().catch(function () {
                return {};
            });
            if (!payload || payload.success !== true || !Array.isArray(payload.products)) {
                return;
            }

            localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(payload.products));
            var apiCatalog = buildCatalogFromProducts(payload.products);
            if (apiCatalog.length) {
                liveCatalog = apiCatalog;
            }
        } catch (_error) {
            // keep current catalog
        }
    }

    function startCatalogSync() {
        refreshCatalogFromStorage();
        void refreshCatalogFromApi();

        window.addEventListener("storage", function (event) {
            if (event.key !== PRODUCT_STORAGE_KEY) {
                return;
            }
            refreshCatalogFromStorage();
        });
    }

    function getActiveCatalog() {
        if (Array.isArray(liveCatalog) && liveCatalog.length) {
            return liveCatalog.slice();
        }
        return buildCatalogFromProducts(DEFAULT_BIKE_CATALOG);
    }

    function getWheelFilter(normalizedQuestion) {
        if (includesAny(normalizedQuestion, ["2 wheel", "2 wheels", "two wheel", "2w", "dalawang gulong"])) return "2-Wheel";
        if (includesAny(normalizedQuestion, ["3 wheel", "3 wheels", "three wheel", "3w", "tatlong gulong"])) return "3-Wheel";
        if (includesAny(normalizedQuestion, ["4 wheel", "4 wheels", "four wheel", "4w", "apat na gulong"])) return "4-Wheel";
        return "";
    }

    function getCatalogByWheel(wheel) {
        var catalog = getActiveCatalog();
        if (!wheel) return catalog;
        return catalog.filter(function (item) {
            return item.category === wheel;
        });
    }

    function findModelMatches(questionText) {
        var normalizedQuestion = normalizeText(questionText);
        var wheelFilter = getWheelFilter(normalizedQuestion);
        var catalog = getActiveCatalog();

        if (!normalizedQuestion) return [];

        return catalog.filter(function (item) {
            var directModel = normalizedQuestion.indexOf(normalizeText(item.model)) >= 0;
            var aliasHit = item.aliases.some(function (alias) {
                return normalizedQuestion.indexOf(normalizeText(alias)) >= 0;
            });

            if (!(directModel || aliasHit)) return false;
            if (!wheelFilter) return true;
            return item.category === wheelFilter;
        });
    }

    function getCurrentUserEmail() {
        var localValue = String(localStorage.getItem(CURRENT_USER_KEY) || "").trim().toLowerCase();
        if (localValue) return localValue;
        return String(sessionStorage.getItem(CURRENT_USER_KEY) || "").trim().toLowerCase();
    }

    function isCancelled(statusValue, fulfillmentValue) {
        var merged = (String(statusValue || "") + " " + String(fulfillmentValue || "")).toLowerCase();
        return merged.indexOf("cancel") >= 0;
    }

    function canCancel(statusValue, fulfillmentValue) {
        var merged = (String(statusValue || "") + " " + String(fulfillmentValue || "")).toLowerCase();
        if (merged.indexOf("cancel") >= 0) return false;
        if (merged.indexOf("completed") >= 0 || merged.indexOf("delivered") >= 0) return false;
        return true;
    }

    function readBookingsForUser() {
        var currentEmail = getCurrentUserEmail();
        var merged = [];

        BOOKING_KEYS.forEach(function (key) {
            var parsed = safeParse(localStorage.getItem(key));
            if (Array.isArray(parsed)) {
                merged = merged.concat(parsed);
            }
        });

        var latest = safeParse(localStorage.getItem("latestBooking"));
        if (latest && typeof latest === "object") {
            merged.push(latest);
        }

        return merged
            .map(function (item, index) {
                if (!item || typeof item !== "object") return null;
                var recordEmail = String(item.email || item.userEmail || "").trim().toLowerCase();
                if (currentEmail && recordEmail !== currentEmail) return null;

                var status = String(item.status || "Preparing");
                var service = String(item.service || item.deliveryOption || "Delivery");
                var fulfillmentStatus = String(item.fulfillmentStatus || (service === "Pick Up" ? "Ready to Pick up" : "In Process"));
                if (isCancelled(status, fulfillmentStatus)) return null;

                return {
                    orderId: String(item.orderId || item.id || ("#EC-" + (1000 + index))),
                    model: String(item.model || item.productName || item.itemName || "Ecodrive E-Bike"),
                    status: status,
                    fulfillmentStatus: fulfillmentStatus,
                    createdAt: String(item.createdAt || item.updatedAt || ""),
                    canCancel: canCancel(status, fulfillmentStatus)
                };
            })
            .filter(Boolean)
            .sort(function (a, b) {
                return String(b.createdAt).localeCompare(String(a.createdAt));
            });
    }

    function getBookingSummary() {
        var items = readBookingsForUser();
        if (!items.length) {
            return "Wala ka pang active booking. Pwede ka mag-book from Ebikes Products page.";
        }
        var latest = items[0];
        return "May " + items.length + " active booking(s). Latest: " + latest.model + " - " + latest.status + " (" + latest.fulfillmentStatus + ").";
    }

    function getCancelSummary() {
        var items = readBookingsForUser();
        if (!items.length) {
            return "Wala ka pang active booking kaya wala pang kailangan i-cancel.";
        }

        var cancellableCount = items.filter(function (item) {
            return item.canCancel;
        }).length;

        if (!cancellableCount) {
            return "Sa ngayon, walang cancellable booking. Completed or delivered orders cannot be cancelled.";
        }
        return "May " + cancellableCount + " booking(s) na puwedeng i-cancel. Gamitin ang Cancel button sa Bookings page.";
    }

    function getReply(text, state) {
        var localState = state || {};
        if (typeof localState.awaitingPriceModel !== "boolean") {
            localState.awaitingPriceModel = false;
        }

        var normalized = normalizeText(text);
        var wheelFilter = getWheelFilter(normalized);
        var modelMatches = findModelMatches(text);
        var isPriceQuestion = includesAny(normalized, ["price", "presyo", "magkano", "mag kano", "hm", "how much", "cost"]);

        if (!normalized) {
            return "Type your question and I will help.";
        }

        if (includesAny(normalized, ["help", "tulong", "what can you do", "ano pwede itanong"])) {
            localState.awaitingPriceModel = false;
            return "Pwede mo itanong: available models, model price, cheapest ebike, booking status, payment options, installment, delivery or pick up, cancel booking, at repair booking.";
        }

        if (includesAny(normalized, ["hello", "hi", "hey", "kumusta", "kamusta", "good morning", "good afternoon", "good evening"])) {
            localState.awaitingPriceModel = false;
            return "Hi! Ready ako tumulong tungkol sa Ecodrive ebikes, prices, at bookings.";
        }

        if (includesAny(normalized, ["salamat", "thanks", "thank you"])) {
            localState.awaitingPriceModel = false;
            return "You are welcome. Sabihin mo lang kung may tanong ka pa.";
        }

        if (includesAny(normalized, ["pinakamura", "cheapest", "lowest"])) {
            localState.awaitingPriceModel = false;
            var cheapestPool = getCatalogByWheel(wheelFilter);
            if (!cheapestPool.length) return "Wala akong nakita na model para sa category na iyan.";
            var cheapest = cheapestPool.reduce(function (best, item) {
                return item.price < best.price ? item : best;
            }, cheapestPool[0]);
            return "Pinakamura sa " + (wheelFilter || "all categories") + " is " + cheapest.model + " at " + formatPeso(cheapest.price) + ".";
        }

        if (includesAny(normalized, ["pinakamahal", "most expensive", "highest price", "premium"])) {
            localState.awaitingPriceModel = false;
            var expensivePool = getCatalogByWheel(wheelFilter);
            if (!expensivePool.length) return "Wala akong nakita na model para sa category na iyan.";
            var expensive = expensivePool.reduce(function (best, item) {
                return item.price > best.price ? item : best;
            }, expensivePool[0]);
            return "Pinakamahal sa " + (wheelFilter || "all categories") + " is " + expensive.model + " at " + formatPeso(expensive.price) + ".";
        }

        if (isPriceQuestion || localState.awaitingPriceModel) {
            if (modelMatches.length === 1) {
                localState.awaitingPriceModel = false;
                return modelMatches[0].model + " costs " + formatPeso(modelMatches[0].price) + " (" + modelMatches[0].category + ").";
            }
            if (modelMatches.length > 1) {
                localState.awaitingPriceModel = false;
                return "May maraming variant na tugma: " + modelMatches.map(function (item) {
                    return item.model + " - " + formatPeso(item.price);
                }).join("; ") + ".";
            }
            localState.awaitingPriceModel = true;
            return "Anong model ang gusto mong i-check? Example: BLITZ 2000, ECARGO 100, or ECONO 500 MP.";
        }

        if (includesAny(normalized, ["book", "booking", "mag book", "magbook", "how to book", "confirm booking"])) {
            localState.awaitingPriceModel = false;
            return "Para mag-book: pumili ng model sa Ebikes Products, click Book Now, fill in customer and shipping info, piliin payment, then Confirm Booking.";
        }

        if (includesAny(normalized, ["available", "models", "model", "catalog", "list", "ano available", "anong ebike", "products"])) {
            localState.awaitingPriceModel = false;
            var availablePool = getCatalogByWheel(wheelFilter);
            if (!availablePool.length) return "Wala akong model list para sa category na iyan.";
            var preview = availablePool.slice(0, 6).map(function (item) {
                return item.model;
            }).join(", ");
            if (availablePool.length > 6) {
                return "Available " + (wheelFilter || "Ecodrive") + " models (" + availablePool.length + "): " + preview + ", at iba pa. Sabihin mo lang yung model para sa exact price.";
            }
            return "Available " + (wheelFilter || "Ecodrive") + " models: " + preview + ".";
        }

        if (includesAny(normalized, ["status", "tracking", "track", "my order", "my booking", "order"])) {
            localState.awaitingPriceModel = false;
            return getBookingSummary();
        }

        if (includesAny(normalized, ["cancel", "cancellation"])) {
            localState.awaitingPriceModel = false;
            return getCancelSummary();
        }

        if (includesAny(normalized, ["payment", "gcash", "maya", "cod", "cash on delivery", "bayad"])) {
            localState.awaitingPriceModel = false;
            return "Payment options: GCash, Maya, at Cash on Delivery. Pumili sa checkout page bago i-confirm ang booking.";
        }

        if (includesAny(normalized, ["installment", "hulugan", "monthly", "downpayment"])) {
            localState.awaitingPriceModel = false;
            return "Supported ang installment flow. Sa payment page, piliin ang Installment then complete the verification steps.";
        }

        if (includesAny(normalized, ["delivery", "pickup", "pick up", "shipping"])) {
            localState.awaitingPriceModel = false;
            return "May Delivery at Pick Up options sa checkout. Delivery adds shipping fee; Pick Up has no shipping fee.";
        }

        if (includesAny(normalized, ["repair", "sira", "maintenance"])) {
            localState.awaitingPriceModel = false;
            return "For repairs, punta sa Repair Booking page then ilagay ang issue details para ma-schedule ka.";
        }

        if (includesAny(normalized, ["contact", "phone", "email", "address", "location", "nasaan"])) {
            localState.awaitingPriceModel = false;
            return "Contact Ecodrive: 09338288185, ecodrive@gmail.com, Poblacion, Baliwag, Bulacan.";
        }

        if (includesAny(normalized, ["ecodrive", "about", "ano ang ecodrive", "sino kayo"])) {
            localState.awaitingPriceModel = false;
            return "Ecodrive offers electric bikes across 2-wheel, 3-wheel, at 4-wheel categories with booking and repair support.";
        }

        return "I can help with ebike models, prices, booking status, payment, installment, delivery, and repair. Type \"help\" for sample questions.";
    }

    function createResponder() {
        var state = { awaitingPriceModel: false };
        return function (text) {
            return getReply(text, state);
        };
    }

    startCatalogSync();
    setupChatEnhancer();

    global.EcodriveChatbotBrain = {
        createResponder: createResponder,
        getReply: function (text, state) {
            return getReply(text, state || { awaitingPriceModel: false });
        },
        getScopedStorageKey: getScopedChatStorageKey,
        getSuggestionQuestions: getSuggestionQuestions
    };
})(window);
