document.addEventListener("DOMContentLoaded", function () {
    const storageKey = "ecodrive_product_catalog";
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

    const gridEl = document.getElementById("product-grid");
    const statusEl = document.getElementById("price-status");

    if (!gridEl || !statusEl) {
        return;
    }

    const defaultProducts = [
        { id: 1, model: "BLITZ 2000", price: 68000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 1.png", detailUrl: "/Userhomefolder/Ebikes/ebike1.0.html", isActive: true },
        { id: 2, model: "BLITZ 1200", price: 45000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 2.png", detailUrl: "/Userhomefolder/Ebikes/ebike2.0.html", isActive: true },
        { id: 3, model: "FUN 1500 FI", price: 74000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 3.png", detailUrl: "/Userhomefolder/Ebikes/ebike3.0.html", isActive: true },
        { id: 4, model: "CANDY 800", price: 58000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 4.png", detailUrl: "/Userhomefolder/Ebikes/ebike4.0.html", isActive: true },
        { id: 5, model: "BLITZ 200R", price: 74000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 5.png", detailUrl: "/Userhomefolder/Ebikes/ebike5.0.html", isActive: true },
        { id: 6, model: "TRAVELLER 1500", price: 79000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 6.png", detailUrl: "/Userhomefolder/Ebikes/ebike6.0.html", isActive: true },
        { id: 7, model: "ECONO 500 MP", price: 51500, category: "2-Wheel", imageUrl: "/Userhomefolder/image 7.png", detailUrl: "/Userhomefolder/Ebikes/ebike7.0.html", isActive: true },
        { id: 8, model: "ECONO 350 MINI-II", price: 58000, category: "2-Wheel", imageUrl: "/Userhomefolder/image 8.png", detailUrl: "/Userhomefolder/Ebikes/ebike8.0.html", isActive: true },
        { id: 9, model: "ECARGO 100", price: 72500, category: "3-Wheel", imageUrl: "/Userhomefolder/image 9.png", detailUrl: "/Userhomefolder/Ebikes/ebike9.0.html", isActive: true },
        { id: 10, model: "ECONO 650 MP", price: 65000, category: "3-Wheel", imageUrl: "/Userhomefolder/image 10.png", detailUrl: "/Userhomefolder/Ebikes/ebike10.0.html", isActive: true },
        { id: 11, model: "ECAB 100V V2", price: 51500, category: "3-Wheel", imageUrl: "/Userhomefolder/image 11.png", detailUrl: "/Userhomefolder/Ebikes/ebike11.0.html", isActive: true },
        { id: 12, model: "ECONO 800 MP II", price: 67000, category: "3-Wheel", imageUrl: "/Userhomefolder/image 12.png", detailUrl: "/Userhomefolder/Ebikes/ebike12.0.html", isActive: true },
        { id: 13, model: "E-CARGO 800", price: 205000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 13.png", detailUrl: "/Userhomefolder/Ebikes/ebike13.0.html", isActive: true },
        { id: 14, model: "E-CAB MAX 1500", price: 130000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 14.png", detailUrl: "/Userhomefolder/Ebikes/ebike14.0.html", isActive: true },
        { id: 15, model: "E-CAB 1000", price: 75000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 15.png", detailUrl: "/Userhomefolder/Ebikes/ebike15.0.html", isActive: true },
        { id: 16, model: "ECONO 800 MP", price: 100000, category: "4-Wheel", imageUrl: "/Userhomefolder/image 16.png", detailUrl: "/Userhomefolder/Ebikes/ebike16.0.html", isActive: true }
    ];

    let products = [];
    let apiAvailable = false;

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

    function toFiniteNumber(value, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return fallback;
        }
        return num;
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

    function formatPeso(amount) {
        return String.fromCharCode(8369) + toFiniteNumber(amount, 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
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

    function sortProducts(items) {
        return items.slice().sort(function (left, right) {
            const categoryDiff = getCategoryOrder(left.category) - getCategoryOrder(right.category);
            if (categoryDiff !== 0) {
                return categoryDiff;
            }
            return String(left.model || "").localeCompare(String(right.model || ""));
        });
    }

    function normalizeProduct(input, fallbackId) {
        const source = input && typeof input === "object" ? input : {};
        const model = normalizeText(source.model || source.name).slice(0, 180);
        if (!model) {
            return null;
        }

        const parsedPrice = parsePrice(source.price);
        const price = Number.isFinite(parsedPrice) ? parsedPrice : 0;
        const rawId = Number(source.id);
        const id = Number.isFinite(rawId) && rawId > 0 ? rawId : Number(fallbackId || 0);
        const imageUrl = String(source.imageUrl || source.image || source.bikeImage || "").trim();
        const detailUrl = String(source.detailUrl || source.detailsUrl || "").trim();
        const info = normalizeText(source.info || source.productInfo || source.description).slice(0, 255);

        return {
            id: id,
            model: model,
            price: price,
            category: normalizeCategory(source.category),
            info: info,
            imageUrl: imageUrl || "/Userhomefolder/image 1.png",
            detailUrl: detailUrl,
            isActive: toIsActive(source.isActive)
        };
    }

    function sanitizeProducts(input) {
        const rows = Array.isArray(input) ? input : [];
        const list = [];
        rows.forEach(function (row, index) {
            const normalized = normalizeProduct(row, index + 1);
            if (normalized) {
                list.push(normalized);
            }
        });
        return sortProducts(list);
    }

    function readProductsFromLocal() {
        const parsed = safeParse(localStorage.getItem(storageKey));
        if (!Array.isArray(parsed)) {
            return [];
        }
        return sanitizeProducts(parsed);
    }

    function saveProductsToLocal(list) {
        localStorage.setItem(storageKey, JSON.stringify(list));
    }

    function setStatus(message, tone) {
        statusEl.textContent = message;
        statusEl.classList.remove("is-success", "is-warning", "is-error");
        if (tone === "success") {
            statusEl.classList.add("is-success");
        } else if (tone === "warning") {
            statusEl.classList.add("is-warning");
        } else if (tone === "error") {
            statusEl.classList.add("is-error");
        }
    }

    function createPriceLabel(product) {
        const wrapper = document.createElement("p");
        wrapper.className = "price";

        const priceText = document.createElement("span");
        priceText.textContent = `Price: ${formatPeso(product.price)}`;
        wrapper.appendChild(priceText);

        const editButton = document.createElement("button");
        editButton.className = "edit-btn";
        editButton.type = "button";
        editButton.setAttribute("data-id", String(product.id));
        editButton.setAttribute("aria-label", `Edit ${product.model}`);
        editButton.innerHTML = "&#9998;";
        wrapper.appendChild(editButton);

        return wrapper;
    }

    function createProductCard(product) {
        const card = document.createElement("article");
        card.className = "panel product-card";

        const image = document.createElement("img");
        image.src = product.imageUrl || "/Userhomefolder/image 1.png";
        image.alt = product.model;
        card.appendChild(image);

        const title = document.createElement("h3");
        title.textContent = product.model;
        card.appendChild(title);

        const category = document.createElement("p");
        category.className = "product-category";
        category.textContent = product.category || "Other";
        card.appendChild(category);

        card.appendChild(createPriceLabel(product));
        return card;
    }

    function renderProducts() {
        gridEl.innerHTML = "";
        const activeProducts = products.filter(function (item) {
            return item.isActive !== false;
        });

        if (!activeProducts.length) {
            const emptyCard = document.createElement("article");
            emptyCard.className = "panel product-card product-card-empty";
            emptyCard.textContent = "No models available.";
            gridEl.appendChild(emptyCard);
            return;
        }

        const fragment = document.createDocumentFragment();
        activeProducts.forEach(function (product) {
            fragment.appendChild(createProductCard(product));
        });
        gridEl.appendChild(fragment);
    }

    function findProductById(id) {
        return products.find(function (item) {
            return Number(item.id) === Number(id);
        }) || null;
    }

    async function fetchProductsFromApi() {
        try {
            const response = await fetch(getApiUrl("/api/admin/products"), {
                method: "GET"
            });

            if (response.status === 404 || response.status === 405) {
                return { mode: "unavailable", products: [] };
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok || payload.success !== true) {
                return {
                    mode: "error",
                    message: payload.message || "Failed to load products."
                };
            }

            return {
                mode: "ok",
                products: sanitizeProducts(payload.products)
            };
        } catch (_error) {
            return { mode: "unavailable", products: [] };
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

    async function handleEdit(productId) {
        const target = findProductById(productId);
        if (!target) {
            return;
        }

        const rawPrice = window.prompt(
            `Update price for ${target.model}:`,
            String(target.price)
        );
        if (rawPrice === null) {
            return;
        }

        const nextPrice = parsePrice(rawPrice);
        if (!Number.isFinite(nextPrice)) {
            window.alert("Invalid price. Enter numbers only.");
            return;
        }

        if (apiAvailable && Number(target.id) > 0) {
            const apiResult = await updateProductViaApi(target.id, { price: nextPrice });
            if (apiResult.mode === "ok" && apiResult.product) {
                products = products.map(function (item) {
                    return Number(item.id) === Number(target.id) ? apiResult.product : item;
                });
                products = sortProducts(products);
                saveProductsToLocal(products);
                renderProducts();
                setStatus(`Updated ${target.model} price.`, "success");
                return;
            }

            if (apiResult.mode === "error") {
                window.alert(apiResult.message || "Unable to update model price.");
                return;
            }
        }
        window.alert("Unable to update model price because the API is unavailable.");
    }

    gridEl.addEventListener("click", function (event) {
        const button = event.target.closest(".edit-btn");
        if (!button) {
            return;
        }
        const productId = Number(button.getAttribute("data-id"));
        if (!Number.isFinite(productId)) {
            return;
        }
        void handleEdit(productId);
    });

    window.addEventListener("storage", function (event) {
        if (event.key !== storageKey || apiAvailable) {
            return;
        }
        products = readProductsFromLocal();
        renderProducts();
    });

    async function init() {
        setStatus("Loading models...", "warning");
        const apiResult = await fetchProductsFromApi();

        if (apiResult.mode === "ok") {
            apiAvailable = true;
            products = apiResult.products.length
                ? apiResult.products
                : [];
            saveProductsToLocal(products);
            renderProducts();
            setStatus("", "");
            return;
        }

        products = readProductsFromLocal();
        renderProducts();

        if (products.length) {
            setStatus("Live API unavailable. Showing last synced catalog.", "warning");
            return;
        }

        if (apiResult.mode === "error") {
            setStatus(apiResult.message || "Unable to load product catalog.", "error");
            return;
        }

        setStatus("API unavailable. Unable to load product catalog.", "error");
    }

    void init();
});
