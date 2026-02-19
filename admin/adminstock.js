document.addEventListener("DOMContentLoaded", function () {
    const storageKey = "ecodrive_product_catalog";
    const colorStorageKey = "ecodrive_color_variant_availability_v1";
    const apiBase = String(
        (window.EcodriveSession && typeof window.EcodriveSession.getApiBase === "function"
            ? window.EcodriveSession.getApiBase()
            : localStorage.getItem("ecodrive_api_base")
                || localStorage.getItem("ecodrive_kyc_api_base")
                || "http://127.0.0.1:5050")
    )
        .trim()
        .replace(/\/+$/, "");

    if (!window.EcodriveSession || typeof window.EcodriveSession.requireRole !== "function" || !window.EcodriveSession.requireRole("admin")) {
        return;
    }

    const stockGridEl = document.getElementById("stock-grid");
    const statusEl = document.getElementById("stock-status");
    const statTotalModelsEl = document.getElementById("stock-total-models");
    const statAvailableEl = document.getElementById("stock-total-available");
    const statUnavailableEl = document.getElementById("stock-total-unavailable");
    const statNewThisMonthEl = document.getElementById("stock-new-this-month");
    const openAddBtn = document.getElementById("open-add-model");
    const addFormPanel = document.getElementById("stock-add-form-panel");
    const addForm = document.getElementById("stock-add-form");
    const modelInput = document.getElementById("stock-model-input");
    const categoryInput = document.getElementById("stock-category-input");
    const priceInput = document.getElementById("stock-price-input");
    const infoInput = document.getElementById("stock-info-input");
    const imageFileInput = document.getElementById("stock-image-file-input");
    const imageInput = document.getElementById("stock-image-input");
    const detailInput = document.getElementById("stock-detail-input");
    const saveBtn = document.getElementById("stock-save-btn");
    const cancelBtn = document.getElementById("stock-cancel-btn");
    const addStatusEl = document.getElementById("stock-add-status");
    const colorModelSelectEl = document.getElementById("stock-color-model-select");
    const colorStatusEl = document.getElementById("stock-color-status");
    const colorListEl = document.getElementById("stock-color-list");

    if (
        !stockGridEl ||
        !statusEl ||
        !statTotalModelsEl ||
        !statAvailableEl ||
        !statUnavailableEl ||
        !statNewThisMonthEl ||
        !openAddBtn ||
        !addFormPanel ||
        !addForm ||
        !modelInput ||
        !categoryInput ||
        !priceInput ||
        !infoInput ||
        !imageFileInput ||
        !imageInput ||
        !detailInput ||
        !saveBtn ||
        !cancelBtn ||
        !addStatusEl ||
        !colorModelSelectEl ||
        !colorStatusEl ||
        !colorListEl
    ) {
        return;
    }

    let products = [];
    let apiAvailable = false;
    let colorVariantsByModel = {};

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function normalizeText(value) {
        return String(value || "").trim().replace(/\s+/g, " ");
    }

    function normalizeCategory(value) {
        const raw = String(value || "").trim().toLowerCase();
        if (!raw) {
            return "Other";
        }
        if (raw.includes("2")) {
            return "2-Wheel";
        }
        if (raw.includes("3")) {
            return "3-Wheel";
        }
        if (raw.includes("4")) {
            return "4-Wheel";
        }
        return "Other";
    }

    function parsePrice(value) {
        const numeric = Number(String(value || "").replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(numeric) || numeric < 0) {
            return NaN;
        }
        return Number(numeric.toFixed(2));
    }

    function toIsActive(value) {
        if (value === false || value === 0 || value === "0") {
            return false;
        }
        const normalized = String(value === undefined || value === null ? "1" : value).trim().toLowerCase();
        if (normalized === "false" || normalized === "no") {
            return false;
        }
        return true;
    }

    function formatPeso(value) {
        return String.fromCharCode(8369) + Number(value || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    async function readImageFileAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () {
                resolve(String(reader.result || ""));
            };
            reader.onerror = function () {
                reject(new Error("Unable to read selected image file."));
            };
            reader.readAsDataURL(file);
        });
    }

    function getApiUrl(path) {
        return apiBase ? `${apiBase}${path}` : path;
    }

    function getCategoryOrder(category) {
        if (category === "2-Wheel") return 1;
        if (category === "3-Wheel") return 2;
        if (category === "4-Wheel") return 3;
        return 4;
    }

    function normalizeProduct(input, fallbackId) {
        const source = input && typeof input === "object" ? input : {};
        const model = normalizeText(source.model || source.name).slice(0, 180);
        if (!model) {
            return null;
        }

        const rawId = Number(source.id);
        const id = Number.isFinite(rawId) && rawId > 0 ? rawId : Number(fallbackId || 0);
        const imageUrl = String(source.imageUrl || source.image || source.bikeImage || "").trim();
        const createdAt = String(source.createdAt || source.created_at || "").trim();
        const parsedPrice = parsePrice(source.price);
        const info = normalizeText(source.info || source.productInfo || source.description).slice(0, 255);
        const detailUrl = String(source.detailUrl || source.detailsUrl || source.detail_url || "").trim();

        return {
            id: id,
            model: model,
            price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
            category: normalizeCategory(source.category),
            info: info,
            imageUrl: imageUrl || "/Userhomefolder/image 1.png",
            detailUrl: detailUrl,
            isActive: toIsActive(source.isActive),
            createdAt: createdAt || null
        };
    }

    function sanitizeProducts(input) {
        const rows = Array.isArray(input) ? input : [];
        return rows
            .map(function (row, index) {
                return normalizeProduct(row, index + 1);
            })
            .filter(Boolean)
            .sort(function (left, right) {
                const categoryDiff = getCategoryOrder(left.category) - getCategoryOrder(right.category);
                if (categoryDiff !== 0) {
                    return categoryDiff;
                }
                return String(left.model || "").localeCompare(String(right.model || ""));
            });
    }

    function readProductsFromLocal() {
        const parsed = safeParse(localStorage.getItem(storageKey));
        if (!Array.isArray(parsed)) {
            return [];
        }
        return sanitizeProducts(parsed);
    }

    function saveProductsToLocal(items) {
        localStorage.setItem(storageKey, JSON.stringify(items));
    }

    function normalizeModelKey(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function normalizeColorKey(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
            .replace(/\s+/g, "-");
    }

    function formatColorLabel(value, fallbackIndex) {
        const raw = String(value || "")
            .replace(/\bcolor\b/ig, "")
            .trim();
        if (raw) {
            return raw.charAt(0).toUpperCase() + raw.slice(1);
        }
        return `Color ${fallbackIndex + 1}`;
    }

    function sanitizeColorVariant(input, fallbackIndex) {
        const source = input && typeof input === "object" ? input : {};
        const key = normalizeColorKey(source.key || source.color || source.name || source.label || `color ${fallbackIndex + 1}`);
        if (!key) {
            return null;
        }

        return {
            key: key,
            label: formatColorLabel(source.label || source.name || source.color || source.key, fallbackIndex),
            imageUrl: String(source.imageUrl || source.image || "").trim(),
            isActive: toIsActive(source.isActive)
        };
    }

    function sanitizeColorVariantList(input) {
        const rows = Array.isArray(input) ? input : [];
        const seen = {};
        const output = [];
        rows.forEach(function (row, index) {
            const normalized = sanitizeColorVariant(row, index);
            if (!normalized || seen[normalized.key]) {
                return;
            }
            seen[normalized.key] = true;
            output.push(normalized);
        });
        return output;
    }

    function sanitizeColorVariantMap(input) {
        const source = input && typeof input === "object" ? input : {};
        const output = {};
        Object.keys(source).forEach(function (key) {
            const modelKey = normalizeModelKey(key);
            if (!modelKey) {
                return;
            }
            const list = sanitizeColorVariantList(source[key]);
            if (list.length) {
                output[modelKey] = list;
            }
        });
        return output;
    }

    function readColorVariantsFromLocal() {
        return sanitizeColorVariantMap(safeParse(localStorage.getItem(colorStorageKey)));
    }

    function saveColorVariantsToLocal(map) {
        localStorage.setItem(colorStorageKey, JSON.stringify(sanitizeColorVariantMap(map)));
    }

    function setColorStatus(message, tone) {
        colorStatusEl.textContent = String(message || "");
        colorStatusEl.classList.remove("is-success", "is-warning", "is-error", "is-muted");
        if (tone === "success") {
            colorStatusEl.classList.add("is-success");
        } else if (tone === "warning") {
            colorStatusEl.classList.add("is-warning");
        } else if (tone === "error") {
            colorStatusEl.classList.add("is-error");
        } else if (tone === "muted") {
            colorStatusEl.classList.add("is-muted");
        }
    }

    function getColorClassToken(className) {
        const tokens = String(className || "")
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

    function resolveImageUrlFromDetail(imageUrl, detailUrl) {
        const raw = String(imageUrl || "").trim();
        if (!raw) {
            return "";
        }
        if (/^data:image\//i.test(raw)) {
            return raw;
        }
        if (/^https?:\/\//i.test(raw)) {
            return raw;
        }
        if (raw.startsWith("/")) {
            return raw;
        }
        if (detailUrl) {
            try {
                const baseUrl = new URL(detailUrl, window.location.origin);
                const resolved = new URL(raw, baseUrl);
                return `${resolved.pathname}${resolved.search}${resolved.hash}`;
            } catch (_error) {
                // continue with fallback normalization
            }
        }
        if (raw.startsWith("../")) {
            return `/Userhomefolder/${raw.slice(3)}`;
        }
        if (raw.startsWith("./")) {
            return raw.slice(2);
        }
        return raw;
    }

    async function readColorVariantsFromDetailPage(product) {
        const detailUrl = String(product && product.detailUrl || "").trim();
        if (!detailUrl) {
            return [];
        }

        try {
            const response = await fetch(detailUrl, { method: "GET" });
            if (!response.ok) {
                return [];
            }
            const markup = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(markup, "text/html");
            const dots = Array.from(doc.querySelectorAll(".dot"));
            if (!dots.length) {
                return [];
            }

            const variants = dots.map(function (dot, index) {
                const dataColor = String(dot.getAttribute("data-color") || "").trim();
                const ariaLabel = String(dot.getAttribute("aria-label") || "").replace(/\bcolor\b/ig, "").trim();
                const classColor = getColorClassToken(dot.getAttribute("class"));
                const colorName = dataColor || ariaLabel || classColor || `Color ${index + 1}`;
                const imageUrl = resolveImageUrlFromDetail(
                    String(dot.getAttribute("data-image") || "").trim(),
                    detailUrl
                );
                return {
                    key: colorName,
                    label: colorName,
                    imageUrl: imageUrl,
                    isActive: true
                };
            });

            return sanitizeColorVariantList(variants);
        } catch (_error) {
            return [];
        }
    }

    function mergeColorVariants(product, detectedList, existingList) {
        const fallback = sanitizeColorVariantList([{
            key: "default",
            label: "Default",
            imageUrl: product.imageUrl || "/Userhomefolder/image 1.png",
            isActive: true
        }]);
        const discovered = detectedList.length ? detectedList : fallback;
        const existingByKey = {};
        existingList.forEach(function (item) {
            existingByKey[item.key] = item;
        });

        const merged = discovered.map(function (item, index) {
            const previous = existingByKey[item.key];
            return {
                key: item.key,
                label: item.label || (previous ? previous.label : formatColorLabel(item.key, index)),
                imageUrl: item.imageUrl || (previous ? previous.imageUrl : product.imageUrl || ""),
                isActive: previous ? toIsActive(previous.isActive) : true
            };
        });

        existingList.forEach(function (item) {
            const exists = merged.some(function (candidate) {
                return candidate.key === item.key;
            });
            if (!exists) {
                merged.push(item);
            }
        });

        return sanitizeColorVariantList(merged);
    }

    function getModelOptions() {
        const seen = {};
        const options = [];
        products.forEach(function (product) {
            const modelKey = normalizeModelKey(product.model);
            if (!modelKey || seen[modelKey]) {
                return;
            }
            seen[modelKey] = true;
            options.push({
                key: modelKey,
                label: product.model
            });
        });
        options.sort(function (left, right) {
            return String(left.label || "").localeCompare(String(right.label || ""));
        });
        return options;
    }

    function getModelLabelByKey(modelKey) {
        const option = getModelOptions().find(function (item) {
            return item.key === modelKey;
        });
        return option ? option.label : modelKey;
    }

    function renderColorModelOptions() {
        const options = getModelOptions();
        const previous = String(colorModelSelectEl.value || "");
        colorModelSelectEl.innerHTML = "";

        if (!options.length) {
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "No models";
            colorModelSelectEl.appendChild(empty);
            colorModelSelectEl.disabled = true;
            return;
        }

        options.forEach(function (item) {
            const option = document.createElement("option");
            option.value = item.key;
            option.textContent = item.label;
            colorModelSelectEl.appendChild(option);
        });

        colorModelSelectEl.disabled = false;
        const hasPrevious = options.some(function (item) {
            return item.key === previous;
        });
        colorModelSelectEl.value = hasPrevious ? previous : options[0].key;
    }

    function renderColorVariantList() {
        const modelKey = String(colorModelSelectEl.value || "").trim();
        colorListEl.innerHTML = "";

        if (!modelKey) {
            return;
        }

        const variants = Array.isArray(colorVariantsByModel[modelKey]) ? colorVariantsByModel[modelKey] : [];
        if (!variants.length) {
            const empty = document.createElement("article");
            empty.className = "color-item";
            empty.innerHTML = "<p class=\"color-item-name\">No color variants found.</p>";
            colorListEl.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        variants.forEach(function (variant) {
            const row = document.createElement("article");
            row.className = "color-item";

            const main = document.createElement("div");
            main.className = "color-item-main";

            const head = document.createElement("div");
            head.className = "color-item-head";

            const image = document.createElement("img");
            image.className = "color-item-image";
            image.alt = `${variant.label} preview`;
            image.src = variant.imageUrl || "/Userhomefolder/image 1.png";
            image.loading = "lazy";
            image.onerror = function () {
                image.onerror = null;
                image.src = "/Userhomefolder/image 1.png";
            };
            head.appendChild(image);

            const titleWrap = document.createElement("div");
            titleWrap.className = "color-item-title-wrap";

            const name = document.createElement("p");
            name.className = "color-item-name";
            name.textContent = variant.label;
            titleWrap.appendChild(name);

            head.appendChild(titleWrap);
            main.appendChild(head);

            const status = document.createElement("p");
            status.className = `color-item-status ${variant.isActive ? "available" : "removed"}`;
            status.textContent = variant.isActive ? "Available" : "Removed";
            main.appendChild(status);

            const button = document.createElement("button");
            button.type = "button";
            button.className = `color-toggle-btn ${variant.isActive ? "remove" : "restore"}`;
            button.setAttribute("data-model-key", modelKey);
            button.setAttribute("data-color-key", variant.key);
            button.setAttribute("data-next-active", variant.isActive ? "0" : "1");
            button.textContent = variant.isActive ? "Remove Color" : "Restore Color";

            row.appendChild(main);
            row.appendChild(button);
            fragment.appendChild(row);
        });
        colorListEl.appendChild(fragment);
    }

    function renderColorManager() {
        renderColorModelOptions();
        renderColorVariantList();
    }

    async function syncColorVariantsFromProducts() {
        const snapshot = sanitizeColorVariantMap(colorVariantsByModel);
        const tasks = products.map(async function (product) {
            const modelKey = normalizeModelKey(product.model);
            if (!modelKey) {
                return null;
            }
            const existingList = Array.isArray(snapshot[modelKey]) ? snapshot[modelKey] : [];
            const detectedList = await readColorVariantsFromDetailPage(product);
            const mergedList = mergeColorVariants(product, detectedList, existingList);
            return {
                modelKey: modelKey,
                list: mergedList
            };
        });

        const resolved = await Promise.all(tasks);
        const nextMap = Object.assign({}, snapshot);
        resolved.forEach(function (entry) {
            if (!entry || !entry.modelKey || !entry.list.length) {
                return;
            }
            nextMap[entry.modelKey] = entry.list;
        });

        colorVariantsByModel = sanitizeColorVariantMap(nextMap);
        saveColorVariantsToLocal(colorVariantsByModel);
        renderColorManager();
    }

    function handleToggleColorVariant(modelKey, colorKey, shouldBeActive) {
        const variants = Array.isArray(colorVariantsByModel[modelKey]) ? colorVariantsByModel[modelKey] : [];
        const target = variants.find(function (item) {
            return item.key === colorKey;
        });
        if (!target || target.isActive === shouldBeActive) {
            return;
        }

        colorVariantsByModel[modelKey] = sanitizeColorVariantList(
            variants.map(function (item) {
                if (item.key !== colorKey) {
                    return item;
                }
                return Object.assign({}, item, {
                    isActive: shouldBeActive
                });
            })
        );

        saveColorVariantsToLocal(colorVariantsByModel);
        renderColorVariantList();

        const modelLabel = getModelLabelByKey(modelKey);
        const message = shouldBeActive
            ? `${target.label} restored for ${modelLabel}.`
            : `${target.label} removed for ${modelLabel}.`;
        setColorStatus(message, "success");
    }

    function bindColorManager() {
        colorModelSelectEl.addEventListener("change", function () {
            renderColorVariantList();
            setColorStatus("", "");
        });

        colorListEl.addEventListener("click", function (event) {
            const button = event.target.closest(".color-toggle-btn");
            if (!button) {
                return;
            }

            const modelKey = String(button.getAttribute("data-model-key") || "").trim();
            const colorKey = String(button.getAttribute("data-color-key") || "").trim();
            if (!modelKey || !colorKey) {
                return;
            }

            const shouldBeActive = button.getAttribute("data-next-active") === "1";
            handleToggleColorVariant(modelKey, colorKey, shouldBeActive);
        });
    }

    function setStatus(message, tone) {
        statusEl.textContent = message;
        statusEl.classList.remove("is-success", "is-warning", "is-error", "is-muted");
        if (tone === "success") {
            statusEl.classList.add("is-success");
        } else if (tone === "warning") {
            statusEl.classList.add("is-warning");
        } else if (tone === "error") {
            statusEl.classList.add("is-error");
        } else if (tone === "muted") {
            statusEl.classList.add("is-muted");
        }
    }

    function setAddStatus(message, tone) {
        addStatusEl.textContent = String(message || "");
        addStatusEl.classList.remove("is-success", "is-warning", "is-error", "is-muted");
        if (tone === "success") {
            addStatusEl.classList.add("is-success");
        } else if (tone === "warning") {
            addStatusEl.classList.add("is-warning");
        } else if (tone === "error") {
            addStatusEl.classList.add("is-error");
        } else if (tone === "muted") {
            addStatusEl.classList.add("is-muted");
        }
    }

    function toggleAddPanel(show) {
        const shouldShow = Boolean(show);
        addFormPanel.classList.toggle("is-hidden", !shouldShow);
        addFormPanel.setAttribute("aria-hidden", String(!shouldShow));
    }

    function resetAddForm() {
        addForm.reset();
        categoryInput.value = "2-Wheel";
        imageFileInput.value = "";
        imageInput.value = "/Userhomefolder/image 1.png";
        setAddStatus("", "");
    }

    function createStockCard(product) {
        const card = document.createElement("article");
        card.className = "panel stock-card";

        const model = document.createElement("p");
        model.className = "model";
        model.textContent = `MODEL: ${product.model}`;
        card.appendChild(model);

        const category = document.createElement("p");
        category.className = "stock-category";
        category.textContent = product.category;
        card.appendChild(category);

        const price = document.createElement("p");
        price.className = "stock-price";
        price.textContent = `Price: ${formatPeso(product.price)}`;
        card.appendChild(price);

        const info = document.createElement("p");
        info.className = "stock-info";
        info.textContent = product.info || "No model info yet.";
        card.appendChild(info);

        const image = document.createElement("img");
        image.src = product.imageUrl || "/Userhomefolder/image 1.png";
        image.alt = product.model;
        image.onerror = function () {
            image.onerror = null;
            image.src = "/Userhomefolder/image 1.png";
        };
        card.appendChild(image);

        const status = document.createElement("p");
        status.className = `status ${product.isActive ? "available" : "out"}`;
        status.textContent = product.isActive ? "Available" : "Unavailable";
        card.appendChild(status);

        const actions = document.createElement("div");
        actions.className = "stock-actions";

        const actionButton = document.createElement("button");
        actionButton.type = "button";
        actionButton.className = `stock-action-btn ${product.isActive ? "remove" : "restore"}`;
        actionButton.setAttribute("data-id", String(product.id));
        actionButton.setAttribute("data-next-active", product.isActive ? "0" : "1");
        actionButton.textContent = product.isActive ? "Remove" : "Restore";
        actions.appendChild(actionButton);

        card.appendChild(actions);

        return card;
    }

    function renderStats() {
        const totalModels = products.length;
        const available = products.filter(function (item) {
            return item.isActive;
        }).length;
        const unavailable = totalModels - available;

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const newThisMonth = products.filter(function (item) {
            const raw = String(item.createdAt || "").trim();
            if (!raw) {
                return false;
            }
            const date = new Date(raw);
            if (Number.isNaN(date.getTime())) {
                return false;
            }
            return date >= monthStart;
        }).length;

        statTotalModelsEl.textContent = String(totalModels);
        statAvailableEl.textContent = String(available);
        statUnavailableEl.textContent = String(unavailable);
        statNewThisMonthEl.textContent = String(newThisMonth);
    }

    function renderStockCards() {
        stockGridEl.innerHTML = "";
        if (!products.length) {
            const emptyCard = document.createElement("article");
            emptyCard.className = "panel stock-card stock-card-empty";
            emptyCard.textContent = "No models found.";
            stockGridEl.appendChild(emptyCard);
            return;
        }

        const fragment = document.createDocumentFragment();
        products.forEach(function (item) {
            fragment.appendChild(createStockCard(item));
        });
        stockGridEl.appendChild(fragment);
    }

    function isDuplicateModel(model, category) {
        const modelLower = normalizeText(model).toLowerCase();
        const categoryNormalized = normalizeCategory(category);
        return products.some(function (item) {
            return (
                normalizeText(item.model).toLowerCase() === modelLower
                && normalizeCategory(item.category) === categoryNormalized
            );
        });
    }

    async function fetchProductsFromApi() {
        const endpoints = [
            "/api/admin/products?includeInactive=true",
            "/api/products"
        ];
        let sawHttpError = false;
        let lastMessage = "Unable to load stock models.";

        for (let i = 0; i < endpoints.length; i += 1) {
            const endpoint = endpoints[i];
            let response;

            try {
                response = await fetch(getApiUrl(endpoint), {
                    method: "GET"
                });
            } catch (_networkError) {
                continue;
            }

            if (response.status === 404 || response.status === 405) {
                continue;
            }

            const payload = await response.json().catch(function () {
                return {};
            });

            if (!response.ok || payload.success !== true) {
                sawHttpError = true;
                lastMessage = payload.message || `Request failed (${response.status}).`;
                continue;
            }

            return {
                mode: "ok",
                products: sanitizeProducts(payload.products)
            };
        }

        if (sawHttpError) {
            return {
                mode: "error",
                message: lastMessage
            };
        }

        return { mode: "unavailable", products: [] };
    }

    async function createProductViaApi(payload) {
        try {
            const response = await fetch(getApiUrl("/api/admin/products"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable" };
            }

            const body = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || body.success !== true) {
                return {
                    mode: "error",
                    message: body.message || "Unable to add model."
                };
            }

            return {
                mode: "ok",
                product: normalizeProduct(body.product, Date.now())
            };
        } catch (_error) {
            return { mode: "unavailable" };
        }
    }

    async function updateProductViaApi(productId, payload) {
        try {
            const response = await fetch(
                getApiUrl(`/api/admin/products/${encodeURIComponent(productId)}`),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable" };
            }

            const body = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || body.success !== true) {
                return {
                    mode: "error",
                    message: body.message || "Unable to update model."
                };
            }

            return {
                mode: "ok",
                product: normalizeProduct(body.product, productId)
            };
        } catch (_error) {
            return { mode: "unavailable" };
        }
    }

    function findProductById(productId) {
        return products.find(function (item) {
            return Number(item.id) === Number(productId);
        }) || null;
    }

    async function handleToggleModelActive(productId, shouldBeActive) {
        const target = findProductById(productId);
        if (!target) {
            return;
        }

        if (target.isActive === shouldBeActive) {
            return;
        }

        const actionLabel = shouldBeActive ? "restore" : "remove";
        const confirmMessage = shouldBeActive
            ? `Restore ${target.model} to available products?`
            : `Remove ${target.model} from available stocks?`;
        if (!window.confirm(confirmMessage)) {
            return;
        }

        if (apiAvailable && Number(target.id) > 0) {
            const apiResult = await updateProductViaApi(target.id, { isActive: shouldBeActive });
            if (apiResult.mode === "ok" && apiResult.product) {
                products = sanitizeProducts(
                    products.map(function (item) {
                        return Number(item.id) === Number(target.id) ? apiResult.product : item;
                    })
                );
                saveProductsToLocal(products);
                renderStats();
                renderStockCards();
                setStatus(`${target.model} ${actionLabel}d successfully.`, "success");
                return;
            }

            if (apiResult.mode === "error") {
                setStatus(apiResult.message || "Unable to update stock status.", "error");
                return;
            }
        }

        products = sanitizeProducts(
            products.map(function (item) {
                if (Number(item.id) !== Number(target.id)) {
                    return item;
                }
                return Object.assign({}, item, { isActive: shouldBeActive });
            })
        );
        saveProductsToLocal(products);
        renderStats();
        renderStockCards();
        setStatus(`API unavailable. ${target.model} ${actionLabel}d locally.`, "warning");
    }

    async function handleAddSubmit(event) {
        event.preventDefault();
        setAddStatus("", "");

        const model = normalizeText(modelInput.value).slice(0, 180);
        const category = normalizeCategory(categoryInput.value);
        const price = parsePrice(priceInput.value);
        const info = normalizeText(infoInput.value).slice(0, 255);
        const selectedImageFile = imageFileInput.files && imageFileInput.files[0] ? imageFileInput.files[0] : null;
        let imageUrl = String(imageInput.value || "").trim() || "/Userhomefolder/image 1.png";
        const detailUrl = normalizeText(detailInput.value).slice(0, 255);

        if (model.length < 2) {
            setAddStatus("Model name is required.", "error");
            return;
        }
        if (!Number.isFinite(price)) {
            setAddStatus("Price must be a valid number.", "error");
            return;
        }
        if (info.length < 2) {
            setAddStatus("Info is required.", "error");
            return;
        }
        if (selectedImageFile) {
            const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
            if (!allowedTypes.includes(String(selectedImageFile.type || "").toLowerCase())) {
                setAddStatus("Use PNG, JPG, or WEBP image file only.", "error");
                return;
            }
            const maxImageBytes = 2 * 1024 * 1024;
            if (Number(selectedImageFile.size || 0) > maxImageBytes) {
                setAddStatus("Image file is too large. Max size is 2MB.", "error");
                return;
            }
            try {
                imageUrl = await readImageFileAsDataUrl(selectedImageFile);
            } catch (_error) {
                setAddStatus("Unable to read the selected image file.", "error");
                return;
            }
        }
        if (isDuplicateModel(model, category)) {
            setAddStatus("That model already exists in the selected category.", "error");
            return;
        }
        if (!apiAvailable) {
            setAddStatus("Cannot add model while API is unavailable.", "error");
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            const payload = {
                model: model,
                category: category,
                price: price,
                info: info,
                imageUrl: imageUrl,
                detailUrl: detailUrl,
                isActive: true
            };

            const apiResult = await createProductViaApi(payload);
            if (apiResult.mode === "ok" && apiResult.product) {
                products = sanitizeProducts(products.concat(apiResult.product));
                saveProductsToLocal(products);
                renderStats();
                renderStockCards();
                await syncColorVariantsFromProducts();
                setStatus(`Added ${model}.`, "success");
                resetAddForm();
                toggleAddPanel(false);
                return;
            }

            if (apiResult.mode === "error") {
                setAddStatus(apiResult.message || "Unable to add model.", "error");
                return;
            }
            setAddStatus("API unavailable. Unable to add model.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Model";
        }
    }

    function bindAddForm() {
        openAddBtn.addEventListener("click", function () {
            toggleAddPanel(true);
            setAddStatus("", "");
        });

        cancelBtn.addEventListener("click", function () {
            resetAddForm();
            toggleAddPanel(false);
        });

        imageFileInput.addEventListener("change", function () {
            const file = imageFileInput.files && imageFileInput.files[0] ? imageFileInput.files[0] : null;
            if (!file) {
                return;
            }
            setAddStatus(`Selected image: ${file.name}`, "muted");
        });

        addForm.addEventListener("submit", function (event) {
            void handleAddSubmit(event);
        });
    }

    stockGridEl.addEventListener("click", function (event) {
        const actionBtn = event.target.closest(".stock-action-btn");
        if (!actionBtn) {
            return;
        }

        const productId = Number(actionBtn.getAttribute("data-id"));
        if (!Number.isFinite(productId)) {
            return;
        }

        const nextActive = actionBtn.getAttribute("data-next-active") === "1";
        void handleToggleModelActive(productId, nextActive);
    });

    window.addEventListener("storage", function (event) {
        if (event.key === colorStorageKey) {
            colorVariantsByModel = readColorVariantsFromLocal();
            renderColorManager();
            return;
        }

        if (event.key !== storageKey || apiAvailable) {
            return;
        }
        products = readProductsFromLocal();
        renderStats();
        renderStockCards();
        void syncColorVariantsFromProducts();
    });

    async function init() {
        toggleAddPanel(false);
        resetAddForm();
        bindAddForm();
        bindColorManager();
        colorVariantsByModel = readColorVariantsFromLocal();
        renderColorManager();
        setColorStatus("Loading color variants...", "muted");

        setStatus("Loading stock data...", "muted");
        const apiResult = await fetchProductsFromApi();

        if (apiResult.mode === "ok") {
            apiAvailable = true;
            products = apiResult.products.length ? apiResult.products : [];
            saveProductsToLocal(products);
            renderStats();
            renderStockCards();
            await syncColorVariantsFromProducts();
            setColorStatus("", "");
            setStatus("", "");
            return;
        }

        products = readProductsFromLocal();
        renderStats();
        renderStockCards();
        await syncColorVariantsFromProducts();
        setColorStatus("Color availability synced from local data.", "warning");

        if (products.length) {
            setStatus("Live API unavailable. Showing last synced stock data.", "warning");
        } else if (apiResult.mode === "error") {
            setStatus(apiResult.message || "Unable to load stock data.", "error");
        } else {
            setStatus("API unavailable. Unable to load stock data.", "error");
        }
    }

    void init();
});
