(function () {
    "use strict";

    const profileBtn = document.querySelector(".profile-menu .profile-btn");
    const dropdown = document.querySelector(".profile-menu .dropdown");
    const serviceButtons = Array.from(document.querySelectorAll(".mini-btn[data-service]"));
    const paymentButtons = Array.from(document.querySelectorAll(".pay-btn[data-payment]"));
    const formError = document.getElementById("form-error");
    const fullNameInput = document.getElementById("full-name");
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");
    const shipAddressInput = document.getElementById("ship-address");
    const shipLabel = document.querySelector("label[for='ship-address']");
    const shipMapPanel = document.getElementById("ship-map-panel");
    const shipMapFrame = document.getElementById("ship-map-frame");
    const shipMapStatus = document.getElementById("ship-map-status");
    const findAddressBtn = document.getElementById("find-address-btn");
    const useLocationBtn = document.getElementById("use-location-btn");
    const summaryModel = document.getElementById("summary-model");
    const summarySubtitle = document.getElementById("summary-subtitle");
    const summaryImage = document.getElementById("summary-image");
    const subtotalEl = document.getElementById("summary-subtotal");
    const shippingEl = document.getElementById("summary-shipping");
    const totalEl = document.getElementById("summary-total");
    const confirmBtn = document.getElementById("confirm-btn");

    const qrModal = document.getElementById("payment-qr-modal");
    const qrShell = document.getElementById("payment-qr-shell");
    const qrClose = document.getElementById("payment-qr-close");
    const qrBrandLogo = document.getElementById("payment-brand-logo");
    const qrBrandName = document.getElementById("payment-brand-name");
    const qrAmount = document.getElementById("payment-qr-amount");
    const qrRef = document.getElementById("payment-qr-ref");
    const qrImage = document.getElementById("payment-qr-image");
    const qrOpenApp = document.getElementById("payment-open-app");
    const qrOpenBrowser = document.getElementById("payment-open-browser");
    const qrDone = document.getElementById("payment-qr-done");

    if (
        !formError ||
        !fullNameInput ||
        !emailInput ||
        !phoneInput ||
        !shipAddressInput ||
        !summaryModel ||
        !summarySubtitle ||
        !summaryImage ||
        !subtotalEl ||
        !shippingEl ||
        !totalEl ||
        !confirmBtn ||
        !qrModal ||
        !qrShell ||
        !qrClose ||
        !qrBrandLogo ||
        !qrBrandName ||
        !qrAmount ||
        !qrRef ||
        !qrImage ||
        !qrOpenApp ||
        !qrOpenBrowser ||
        !qrDone ||
        !shipMapPanel ||
        !shipMapFrame ||
        !shipMapStatus ||
        !findAddressBtn ||
        !useLocationBtn
    ) {
        return;
    }

    const INSTALLMENT_CHECKOUT_KEY = "ecodrive_installment_checkout";
    const INSTALLMENT_FORM_KEY = "ecodrive_installment_form";
    const CURRENT_USER_KEY = "ecodrive_current_user_email";
    const LEGACY_PROFILE_KEY = "ecodrive_profile_settings";
    const PROFILE_STORAGE_PREFIX = "ecodrive_profile_settings::";
    const USERS_KEY = "users";
    const PAYMENT_SETTINGS_KEY = "ecodrive_payment_settings";
    const bookingStorageKeys = ["ecodrive_bookings", "ecodrive_orders", "orders"];
    const API_BASE = String(
        localStorage.getItem("ecodrive_api_base")
        || localStorage.getItem("ecodrive_kyc_api_base")
        || "http://127.0.0.1:5050"
    )
        .trim()
        .replace(/\/+$/, "");
    const DEFAULT_MAP_COORDS = { lat: 14.5995, lng: 120.9842 };
    const PICKUP_SHOP_ADDRESS = "Poblacion Baliuag beside Southstar Drugs and Xaviery near St. Marys College";
    const PICKUP_SHOP_FALLBACK_COORDS = { lat: 14.9547, lng: 120.9009 };

    let selectedService = "Delivery";
    let selectedPayment = "GCASH";
    let pendingOrder = null;
    let activeWalletContext = null;
    let shippingCoords = null;
    let rememberedDeliveryAddress = "";
    let rememberedDeliveryCoords = null;
    let lastMappedAddressToken = "";
    let addressDebounceTimer = null;
    let pickupCoords = {
        lat: PICKUP_SHOP_FALLBACK_COORDS.lat,
        lng: PICKUP_SHOP_FALLBACK_COORDS.lng
    };
    let pickupCoordsResolved = false;
    let pickupLookupPromise = null;

    if (profileBtn && dropdown) {
        profileBtn.addEventListener("click", function (event) {
            event.stopPropagation();
            dropdown.classList.toggle("show");
        });

        dropdown.addEventListener("click", function (event) {
            event.stopPropagation();
        });

        document.addEventListener("click", function () {
            dropdown.classList.remove("show");
        });
    }

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function getApiUrl(path) {
        return API_BASE ? `${API_BASE}${path}` : path;
    }

    function formatPeso(amount) {
        const value = Number(amount || 0);
        return "&#8369;" + value.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function normalizePhoneValue(phone) {
        const cleaned = String(phone || "").trim().replace(/[\s-]/g, "");
        if (/^\+639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(3);
        }
        if (/^639\d{9}$/.test(cleaned)) {
            return "0" + cleaned.slice(2);
        }
        return cleaned;
    }

    function getCurrentUserEmail() {
        const localValue = (localStorage.getItem(CURRENT_USER_KEY) || "").trim().toLowerCase();
        if (localValue) return localValue;
        return (sessionStorage.getItem(CURRENT_USER_KEY) || "").trim().toLowerCase();
    }

    function getProfileStorageKey(emailValue) {
        const email = String(emailValue || "").trim().toLowerCase();
        return email ? PROFILE_STORAGE_PREFIX + email : LEGACY_PROFILE_KEY;
    }

    function getUsers() {
        const parsed = safeParse(localStorage.getItem(USERS_KEY));
        return Array.isArray(parsed) ? parsed : [];
    }

    function getCurrentUserFromUsers(emailValue) {
        const email = String(emailValue || "").trim().toLowerCase();
        if (!email) return null;
        const users = getUsers();
        return users.find(function (user) {
            return String((user && user.email) || "").trim().toLowerCase() === email;
        }) || null;
    }

    function buildNameFromUser(user) {
        if (!user || typeof user !== "object") return "";
        if (user.name) {
            return String(user.name).trim();
        }
        const first = String(user.firstName || "").trim();
        const middle = String(user.middleInitial || "").trim();
        const last = String(user.lastName || "").trim();
        const middleWithDot = middle ? middle.replace(/\.+$/, "") + "." : "";
        return [first, middleWithDot, last].filter(Boolean).join(" ").trim();
    }

    function getCurrentUserProfile() {
        const currentEmail = getCurrentUserEmail();
        const user = getCurrentUserFromUsers(currentEmail);
        const scopedProfile = safeParse(localStorage.getItem(getProfileStorageKey(currentEmail)));
        const legacyProfile = safeParse(localStorage.getItem(LEGACY_PROFILE_KEY));
        const profile = (scopedProfile && typeof scopedProfile === "object")
            ? scopedProfile
            : ((legacyProfile && typeof legacyProfile === "object") ? legacyProfile : {});

        return {
            fullName: String(
                profile.fullName ||
                profile.name ||
                buildNameFromUser(user) ||
                ""
            ).trim(),
            email: String(
                profile.email ||
                (user && user.email) ||
                currentEmail ||
                ""
            ).trim().toLowerCase(),
            phone: normalizePhoneValue(
                profile.phone ||
                (user && user.phone) ||
                ""
            ),
            address: String(
                profile.address ||
                (user && user.address) ||
                ""
            ).trim()
        };
    }

    function seedCustomerInfo() {
        const profile = getCurrentUserProfile();

        if (profile.fullName && !fullNameInput.value) {
            fullNameInput.value = profile.fullName;
        }
        if (profile.email && !emailInput.value) {
            emailInput.value = profile.email;
        }
        if (profile.phone && !phoneInput.value) {
            phoneInput.value = profile.phone;
        }
        if (profile.address) {
            rememberedDeliveryAddress = profile.address;
            if (!shipAddressInput.value) {
                shipAddressInput.value = profile.address;
            }
        }
    }

    function getFallbackBikeByReferrer() {
        const referrer = document.referrer || "";
        const match = referrer.match(/ebike(\d+)\.0\.html/i);
        const id = match ? Number(match[1]) : 0;
        const map = {
            1: { model: "BLITZ 2000", total: 68000, image: "../image 1.png", subtitle: "2-Wheel" },
            2: { model: "BLITZ 1200", total: 45000, image: "../image 2.png", subtitle: "2-Wheel" },
            3: { model: "FUN 1500 FI", total: 74000, image: "../image 3.png", subtitle: "2-Wheel" },
            4: { model: "CANDY 800", total: 58000, image: "../image 4.png", subtitle: "2-Wheel" },
            5: { model: "BLITZ 200R", total: 74000, image: "../image 5.png", subtitle: "2-Wheel" },
            6: { model: "TRAVELLER 1500", total: 79000, image: "../image 6.png", subtitle: "2-Wheel" },
            7: { model: "ECONO 500 MP", total: 51500, image: "../image 7.png", subtitle: "2-Wheel" },
            8: { model: "ECONO 350 MINI-II", total: 58000, image: "../image 8.png", subtitle: "2-Wheel" },
            9: { model: "ECARGO 100", total: 72500, image: "../image 9.png", subtitle: "3-Wheel" },
            10: { model: "ECONO 650 MP", total: 65000, image: "../image 10.png", subtitle: "3-Wheel" },
            11: { model: "ECAB 100V V2", total: 51500, image: "../image 11.png", subtitle: "3-Wheel" },
            12: { model: "ECONO 800 MP II", total: 67000, image: "../image 12.png", subtitle: "3-Wheel" },
            13: { model: "E-CARGO 800", total: 205000, image: "../image 13.png", subtitle: "4-Wheel" },
            14: { model: "E-CAB MAX 1500", total: 130000, image: "../image 14.png", subtitle: "4-Wheel" },
            15: { model: "E-CAB 1000", total: 75000, image: "../image 15.png", subtitle: "4-Wheel" },
            16: { model: "ECONO 800 MP", total: 100000, image: "../image 16.png", subtitle: "4-Wheel" }
        };
        return map[id] || null;
    }

    function extractSelection(value) {
        if (!value || typeof value !== "object") return null;
        const model = String(value.model || value.productName || value.itemName || value.name || "").trim();
        const subtotal = Number(value.total || value.price || value.amount || 0);
        const image = String(value.bikeImage || value.image || value.img || "").trim();
        const subtitle = String(value.subtitle || value.category || value.type || "").trim();

        if (!model && !subtotal && !image) return null;
        return {
            model: model || "Ecodrive E-Bike",
            total: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0,
            image: image || "../image 1.png",
            subtitle: subtitle || "E-Bike"
        };
    }

    function getSelectedBike() {
        const params = new URLSearchParams(window.location.search);
        const queryModel = params.get("model");
        const queryTotal = Number(params.get("total") || params.get("price") || 0);
        const queryImage = params.get("image");
        const querySubtitle = params.get("subtitle") || params.get("category");
        if (queryModel || queryTotal || queryImage) {
            return {
                model: String(queryModel || "Ecodrive E-Bike"),
                total: Number.isFinite(queryTotal) && queryTotal > 0 ? queryTotal : 68000,
                image: String(queryImage || "../image 1.png"),
                subtitle: String(querySubtitle || "E-Bike")
            };
        }

        const candidates = [
            safeParse(localStorage.getItem("ecodrive_checkout_selection")),
            safeParse(localStorage.getItem("ecodrive_selected_bike")),
            safeParse(localStorage.getItem("selectedBike")),
            safeParse(localStorage.getItem("checkout_selection")),
            safeParse(localStorage.getItem("latestBooking"))
        ];

        for (let i = 0; i < candidates.length; i += 1) {
            const selected = extractSelection(candidates[i]);
            if (selected) return selected;
        }

        const fallback = getFallbackBikeByReferrer();
        if (fallback) return fallback;

        return {
            model: "Ecodrive E-Bike",
            total: 68000,
            image: "../image 1.png",
            subtitle: "E-Bike"
        };
    }

    function getMapEmbedUrl(lat, lng) {
        const x = Number(lng || 0);
        const y = Number(lat || 0);
        const delta = 0.01;
        const left = (x - delta).toFixed(6);
        const bottom = (y - delta).toFixed(6);
        const right = (x + delta).toFixed(6);
        const top = (y + delta).toFixed(6);
        const markerLat = y.toFixed(6);
        const markerLng = x.toFixed(6);
        return "https://www.openstreetmap.org/export/embed.html?bbox="
            + encodeURIComponent(left + "," + bottom + "," + right + "," + top)
            + "&layer=mapnik&marker="
            + encodeURIComponent(markerLat + "," + markerLng);
    }

    function getMapPageUrl(lat, lng) {
        const markerLat = Number(lat || 0).toFixed(6);
        const markerLng = Number(lng || 0).toFixed(6);
        return "https://www.openstreetmap.org/?mlat="
            + encodeURIComponent(markerLat)
            + "&mlon="
            + encodeURIComponent(markerLng)
            + "#map=18/"
            + encodeURIComponent(markerLat)
            + "/"
            + encodeURIComponent(markerLng);
    }

    function setAddressLabel(text) {
        if (shipLabel) {
            shipLabel.textContent = String(text || "");
        }
    }

    function setShippingCoords(lat, lng) {
        const nextLat = Number(lat);
        const nextLng = Number(lng);
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
            return false;
        }
        shippingCoords = {
            lat: Number(nextLat.toFixed(6)),
            lng: Number(nextLng.toFixed(6))
        };
        return true;
    }

    function applyPickupLocationState(statusMessage) {
        shipAddressInput.disabled = false;
        shipAddressInput.readOnly = true;
        shipAddressInput.value = PICKUP_SHOP_ADDRESS;
        shipAddressInput.placeholder = PICKUP_SHOP_ADDRESS;
        setMapEnabled(true);
        findAddressBtn.textContent = "Open Shop Map";
        useLocationBtn.disabled = true;
        setShippingCoords(pickupCoords.lat, pickupCoords.lng);
        renderMapFrame(pickupCoords.lat, pickupCoords.lng);
        lastMappedAddressToken = PICKUP_SHOP_ADDRESS.toLowerCase();
        setMapStatus(statusMessage || "Pick up location pinned to Ecodrive shop.", false);
    }

    async function fetchAddressCoordinates(address) {
        const trimmed = String(address || "").trim();
        if (!trimmed) {
            throw new Error("Address is required.");
        }

        const params = new URLSearchParams({
            format: "jsonv2",
            limit: "1",
            countrycodes: "ph",
            q: trimmed
        });
        const response = await fetch("https://nominatim.openstreetmap.org/search?" + params.toString(), {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error("Map service is unavailable right now.");
        }

        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length < 1) {
            throw new Error("Location not found. Please make your address more specific.");
        }

        const row = rows[0];
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new Error("Map service returned invalid coordinates.");
        }

        return {
            lat: lat,
            lng: lng
        };
    }

    async function resolvePickupCoordinates() {
        if (pickupCoordsResolved) {
            return pickupCoords;
        }
        if (pickupLookupPromise) {
            return pickupLookupPromise;
        }

        pickupLookupPromise = fetchAddressCoordinates(PICKUP_SHOP_ADDRESS)
            .then(function (coords) {
                pickupCoords = {
                    lat: Number(coords.lat.toFixed(6)),
                    lng: Number(coords.lng.toFixed(6))
                };
                pickupCoordsResolved = true;
                return pickupCoords;
            })
            .catch(function () {
                return null;
            })
            .finally(function () {
                pickupLookupPromise = null;
            });

        return pickupLookupPromise;
    }

    function renderMapFrame(lat, lng) {
        shipMapFrame.src = getMapEmbedUrl(lat, lng);
    }

    function setMapStatus(message, isError) {
        shipMapStatus.textContent = message || "";
        shipMapStatus.classList.toggle("error", Boolean(isError));
    }

    function setMapEnabled(enabled) {
        shipMapPanel.classList.toggle("disabled", !enabled);
        findAddressBtn.disabled = !enabled;
        useLocationBtn.disabled = !enabled;
    }

    function rememberCurrentDeliveryState() {
        const address = (shipAddressInput.value || "").trim();
        if (address) {
            rememberedDeliveryAddress = address;
        }
        if (shippingCoords && Number.isFinite(shippingCoords.lat) && Number.isFinite(shippingCoords.lng)) {
            rememberedDeliveryCoords = {
                lat: shippingCoords.lat,
                lng: shippingCoords.lng
            };
        }
    }

    function updateMapFrame(lat, lng, statusMessage) {
        const nextLat = Number(lat);
        const nextLng = Number(lng);
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
            return false;
        }

        shippingCoords = {
            lat: Number(nextLat.toFixed(6)),
            lng: Number(nextLng.toFixed(6))
        };
        rememberedDeliveryCoords = {
            lat: shippingCoords.lat,
            lng: shippingCoords.lng
        };
        renderMapFrame(nextLat, nextLng);
        if (statusMessage) {
            setMapStatus(statusMessage, false);
        }
        return true;
    }

    function markAddressAsChanged() {
        const currentToken = (shipAddressInput.value || "").trim().toLowerCase();
        if (!currentToken || currentToken === lastMappedAddressToken) {
            return;
        }
        shippingCoords = null;
        rememberedDeliveryCoords = null;
        setMapStatus("Address changed. Click Find on Map to refresh location.", false);
    }

    async function geocodeAddress(address, options) {
        const trimmed = String(address || "").trim();
        const silent = options && options.silent === true;
        if (!trimmed) {
            return null;
        }

        if (!silent) {
            setMapStatus("Finding address on map...", false);
        }

        try {
            const coords = await fetchAddressCoordinates(trimmed);
            const lat = Number(coords.lat);
            const lng = Number(coords.lng);

            updateMapFrame(lat, lng, "Location found on map.");
            rememberedDeliveryAddress = trimmed;
            lastMappedAddressToken = trimmed.toLowerCase();
            return {
                lat: lat,
                lng: lng
            };
        } catch (error) {
            if (!silent) {
                setMapStatus(error.message || "Unable to find this address right now.", true);
            }
            return null;
        }
    }

    async function reverseGeocode(lat, lng) {
        const params = new URLSearchParams({
            format: "jsonv2",
            lat: String(lat),
            lon: String(lng)
        });
        const response = await fetch("https://nominatim.openstreetmap.org/reverse?" + params.toString(), {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        if (!response.ok) {
            return "";
        }
        const payload = await response.json();
        return String((payload && payload.display_name) || "").trim();
    }

    function scheduleAddressMapLookup() {
        if (addressDebounceTimer) {
            clearTimeout(addressDebounceTimer);
        }
        addressDebounceTimer = setTimeout(function () {
            if (selectedService !== "Delivery") {
                return;
            }
            const value = (shipAddressInput.value || "").trim();
            if (value.length < 8) {
                return;
            }
            geocodeAddress(value, { silent: true });
        }, 850);
    }

    const selectedBike = getSelectedBike();

    function updateSummary() {
        const subtotal = Number(selectedBike.total || 0);
        const shippingFee = selectedService === "Delivery" ? 250 : 0;
        const grandTotal = subtotal + shippingFee;

        summaryModel.textContent = selectedBike.model.toUpperCase();
        summarySubtitle.textContent = selectedBike.subtitle || "E-Bike";
        summaryImage.src = selectedBike.image || "../image 1.png";
        subtotalEl.innerHTML = formatPeso(subtotal);
        shippingEl.innerHTML = formatPeso(shippingFee);
        totalEl.innerHTML = formatPeso(grandTotal);

        if (selectedService === "Delivery") {
            setAddressLabel("Shipping Address");
            shipAddressInput.disabled = false;
            shipAddressInput.readOnly = false;
            shipAddressInput.placeholder = "Enter shipping address";
            setMapEnabled(true);
            findAddressBtn.textContent = "Find on Map";
            useLocationBtn.disabled = false;

            if ((shipAddressInput.value || "").trim() === PICKUP_SHOP_ADDRESS) {
                shipAddressInput.value = rememberedDeliveryAddress || "";
                shippingCoords = rememberedDeliveryCoords
                    ? {
                        lat: rememberedDeliveryCoords.lat,
                        lng: rememberedDeliveryCoords.lng
                    }
                    : null;
            }

            if (!shipAddressInput.value && rememberedDeliveryAddress) {
                shipAddressInput.value = rememberedDeliveryAddress;
            }

            if (!shippingCoords && rememberedDeliveryCoords) {
                updateMapFrame(rememberedDeliveryCoords.lat, rememberedDeliveryCoords.lng, "Delivery location restored.");
            } else if (!shippingCoords) {
                setMapStatus("Map preview updates when you change the address.", false);
            }
            return;
        }

        if (selectedService === "Pick Up") {
            setAddressLabel("Pick Up Location");
            applyPickupLocationState("Pick up location pinned to Ecodrive shop.");
            void resolvePickupCoordinates().then(function (coords) {
                if (coords && selectedService === "Pick Up") {
                    applyPickupLocationState("Pick up location pinned to Ecodrive shop.");
                }
            });
            return;
        }

        setAddressLabel("Shipping Address");
        shipAddressInput.readOnly = true;
        shipAddressInput.disabled = true;
        shipAddressInput.value = "";
        shippingCoords = null;
        lastMappedAddressToken = "";
        setMapEnabled(false);
        findAddressBtn.textContent = "Find on Map";

        if (selectedService === "Installment") {
            shipAddressInput.placeholder = "Installment flow will continue";
            setMapStatus("Shipping map is not required for installment.", false);
        } else {
            shipAddressInput.placeholder = "Not needed";
            setMapStatus("Shipping map is not required.", false);
        }
    }

    function clearError() {
        formError.textContent = "";
        [fullNameInput, emailInput, phoneInput, shipAddressInput].forEach(function (input) {
            input.classList.remove("invalid");
        });
    }

    function showError(input, message) {
        if (input) input.classList.add("invalid");
        formError.textContent = message;
    }

    function setActiveButton(buttons, activeBtn) {
        buttons.forEach(function (button) {
            button.classList.toggle("active", button === activeBtn);
        });
    }

    function appendRecordToStorage(storageKey, record) {
        const parsed = safeParse(localStorage.getItem(storageKey));
        const list = Array.isArray(parsed) ? parsed : [];
        list.push(record);
        localStorage.setItem(storageKey, JSON.stringify(list));
    }

    async function saveBookingToApi(record) {
        try {
            const response = await fetch(getApiUrl("/api/bookings"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(record)
            });

            if (response.status === 404 || response.status === 405) {
                return false;
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            return response.ok && payload && payload.success === true;
        } catch (_error) {
            return false;
        }
    }

    async function saveBooking(record) {
        await saveBookingToApi(record);
        bookingStorageKeys.forEach(function (key) {
            appendRecordToStorage(key, record);
        });
        localStorage.setItem("latestBooking", JSON.stringify(record));
    }

    function buildOrderDraft() {
        const subtotal = Number(selectedBike.total || 0);
        const shippingFee = selectedService === "Delivery" ? 250 : 0;
        const orderId = "EC-" + Date.now();
        const isInstallmentPayment = selectedPayment === "INSTALLMENT";
        const hasDeliveryCoordinates = selectedService === "Delivery"
            && shippingCoords
            && Number.isFinite(shippingCoords.lat)
            && Number.isFinite(shippingCoords.lng);
        const hasPickupCoordinates = selectedService === "Pick Up"
            && shippingCoords
            && Number.isFinite(shippingCoords.lat)
            && Number.isFinite(shippingCoords.lng);
        const hasShippingCoordinates = hasDeliveryCoordinates || hasPickupCoordinates;
        const shippingAddress = selectedService === "Delivery"
            ? (shipAddressInput.value || "").trim()
            : (selectedService === "Pick Up" ? PICKUP_SHOP_ADDRESS : "");

        return {
            orderId: orderId,
            fullName: (fullNameInput.value || "").trim(),
            email: (emailInput.value || "").trim().toLowerCase(),
            phone: normalizePhoneValue(phoneInput.value || ""),
            model: selectedBike.model,
            bikeImage: selectedBike.image,
            subtotal: subtotal,
            shippingFee: shippingFee,
            total: subtotal + shippingFee,
            payment: isInstallmentPayment ? "Installment" : selectedPayment,
            service: selectedService,
            status: isInstallmentPayment ? "Application Review" : "Pending review",
            fulfillmentStatus: isInstallmentPayment
                ? "Under Review"
                : (selectedService === "Pick Up" ? "Ready to Pick up" : "In Process"),
            shippingAddress: shippingAddress,
            shippingCoordinates: hasShippingCoordinates ? { lat: shippingCoords.lat, lng: shippingCoords.lng } : null,
            shippingMapEmbedUrl: hasShippingCoordinates ? getMapEmbedUrl(shippingCoords.lat, shippingCoords.lng) : "",
            userEmail: getCurrentUserEmail(),
            createdAt: new Date().toISOString()
        };
    }

    function validateInputs() {
        clearError();

        const name = (fullNameInput.value || "").trim();
        const email = (emailInput.value || "").trim();
        const phone = normalizePhoneValue(phoneInput.value || "");

        if (!name) {
            showError(fullNameInput, "Please enter your full name.");
            return false;
        }
        if (!email) {
            showError(emailInput, "Please enter your email.");
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError(emailInput, "Please enter a valid email address.");
            return false;
        }
        if (!/^09\d{9}$/.test(phone)) {
            showError(phoneInput, "Please enter a valid mobile number.");
            return false;
        }
        if (selectedService === "Delivery") {
            const address = (shipAddressInput.value || "").trim();
            if (!address) {
                showError(shipAddressInput, "Shipping address is required for delivery.");
                return false;
            }
        }

        return true;
    }

    function interpolateTemplate(input, values) {
        const template = String(input || "").trim();
        if (!template) {
            return "";
        }
        return template.replace(/\{(\w+)\}/g, function (_match, token) {
            if (Object.prototype.hasOwnProperty.call(values, token)) {
                return encodeURIComponent(String(values[token] || ""));
            }
            return "";
        });
    }

    function readPaymentSettings() {
        const raw = safeParse(localStorage.getItem(PAYMENT_SETTINGS_KEY));
        const input = (raw && typeof raw === "object") ? raw : {};
        const gcashInput = (input.gcash && typeof input.gcash === "object") ? input.gcash : {};
        const mayaInput = (input.maya && typeof input.maya === "object") ? input.maya : {};

        function normalizeLinks(value, fallback) {
            if (!Array.isArray(value)) {
                return fallback.slice();
            }
            const list = value
                .map(function (item) {
                    return String(item || "").trim();
                })
                .filter(Boolean);
            return list.length ? list : fallback.slice();
        }

        return {
            gcash: {
                checkoutUrl: String(gcashInput.checkoutUrl || "").trim(),
                qrText: String(gcashInput.qrText || "").trim(),
                appLinks: normalizeLinks(gcashInput.appLinks, ["gcash://", "https://www.gcash.com/app"])
            },
            maya: {
                checkoutUrl: String(mayaInput.checkoutUrl || "").trim(),
                qrText: String(mayaInput.qrText || "").trim(),
                appLinks: normalizeLinks(mayaInput.appLinks, ["maya://", "paymaya://", "https://www.maya.ph/app"])
            }
        };
    }

    function buildWalletPaymentContext(walletName, order) {
        const isMaya = walletName === "MAYA";
        const paymentSettings = readPaymentSettings();
        const walletKey = isMaya ? "maya" : "gcash";
        const walletSettings = paymentSettings[walletKey];
        const amount = Number(order.total || 0).toFixed(2);
        const replacementValues = {
            amount: amount,
            orderId: order.orderId,
            model: order.model,
            email: order.email,
            phone: order.phone
        };

        const checkoutUrl = interpolateTemplate(walletSettings.checkoutUrl, replacementValues);
        const appLinks = walletSettings.appLinks
            .map(function (link) {
                return interpolateTemplate(link, replacementValues);
            })
            .filter(Boolean);
        const webFallback = isMaya ? "https://www.maya.ph/app" : "https://www.gcash.com/app";
        const browserLink = checkoutUrl || appLinks.find(function (link) {
            return /^https?:\/\//i.test(link);
        }) || webFallback;

        let qrPayload = checkoutUrl || interpolateTemplate(walletSettings.qrText, replacementValues);
        if (!qrPayload) {
            qrPayload = JSON.stringify({
                wallet: walletKey.toUpperCase(),
                merchant: "ECODRIVE",
                amount: amount,
                reference: order.orderId,
                model: order.model
            });
        }

        return {
            isMaya: isMaya,
            walletLabel: isMaya ? "Maya" : "GCash",
            logoSrc: isMaya ? "../Paymaya.png" : "../gcash.png",
            logoAlt: isMaya ? "Maya logo" : "GCash logo",
            appLinks: appLinks.length ? appLinks : [webFallback],
            browserLink: browserLink,
            qrPayload: qrPayload
        };
    }

    function buildQrCodeImageUrl(content) {
        return "https://quickchart.io/qr?size=420&margin=1&text=" + encodeURIComponent(String(content || ""));
    }

    function openQrModal(walletName, amount, order) {
        const context = buildWalletPaymentContext(walletName, order);
        activeWalletContext = context;
        qrShell.classList.toggle("wallet-maya", context.isMaya);
        qrBrandName.textContent = context.walletLabel;
        qrBrandLogo.src = context.logoSrc;
        qrBrandLogo.alt = context.logoAlt;
        qrImage.src = buildQrCodeImageUrl(context.qrPayload);
        qrImage.alt = context.walletLabel + " payment QR";
        qrAmount.innerHTML = "Amount: " + formatPeso(amount);
        qrRef.textContent = "Reference: " + String(order.orderId || "-");

        if (context.browserLink) {
            qrOpenBrowser.href = context.browserLink;
            qrOpenBrowser.classList.remove("hidden");
        } else {
            qrOpenBrowser.href = "#";
            qrOpenBrowser.classList.add("hidden");
        }

        qrModal.classList.add("open");
        qrModal.setAttribute("aria-hidden", "false");
    }

    function closeQrModal() {
        qrModal.classList.remove("open");
        qrModal.setAttribute("aria-hidden", "true");
    }

    function launchAppLink(link) {
        const target = String(link || "").trim();
        if (!target) {
            return;
        }

        if (/^https?:\/\//i.test(target)) {
            window.open(target, "_blank", "noopener");
            return;
        }

        window.location.href = target;
    }

    function openWalletApp(context) {
        if (!context || !Array.isArray(context.appLinks)) {
            return;
        }

        const links = context.appLinks.filter(Boolean);
        if (!links.length) {
            if (context.browserLink) {
                window.open(context.browserLink, "_blank", "noopener");
            }
            return;
        }

        const appLink = links.find(function (item) {
            return !/^https?:\/\//i.test(item);
        });
        const webLink = links.find(function (item) {
            return /^https?:\/\//i.test(item);
        }) || context.browserLink;

        if (!appLink) {
            if (webLink) {
                window.open(webLink, "_blank", "noopener");
            }
            return;
        }

        let pageHidden = false;
        function handleVisibility() {
            if (document.hidden) {
                pageHidden = true;
            }
        }

        document.addEventListener("visibilitychange", handleVisibility);
        launchAppLink(appLink);

        setTimeout(function () {
            document.removeEventListener("visibilitychange", handleVisibility);
            if (!pageHidden && webLink) {
                window.open(webLink, "_blank", "noopener");
            }
        }, 1300);
    }

    serviceButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            const nextService = button.getAttribute("data-service") || "Delivery";
            if (selectedService === "Delivery" && nextService !== "Delivery") {
                rememberCurrentDeliveryState();
            }

            selectedService = nextService;
            setActiveButton(serviceButtons, button);
            updateSummary();
            clearError();
        });
    });

    paymentButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            selectedPayment = button.getAttribute("data-payment") || "GCASH";
            setActiveButton(paymentButtons, button);
            clearError();
        });
    });

    shipAddressInput.addEventListener("input", function () {
        if (selectedService !== "Delivery") {
            return;
        }
        markAddressAsChanged();
        scheduleAddressMapLookup();
    });

    shipAddressInput.addEventListener("blur", function () {
        if (selectedService !== "Delivery") {
            return;
        }
        const address = (shipAddressInput.value || "").trim();
        if (!address || shippingCoords) {
            return;
        }
        geocodeAddress(address, { silent: true });
    });

    findAddressBtn.addEventListener("click", async function () {
        if (selectedService === "Pick Up") {
            applyPickupLocationState("Pick up location pinned to Ecodrive shop.");
            window.open(getMapPageUrl(pickupCoords.lat, pickupCoords.lng), "_blank", "noopener");
            void resolvePickupCoordinates().then(function (coords) {
                if (coords && selectedService === "Pick Up") {
                    applyPickupLocationState("Pick up location pinned to Ecodrive shop.");
                }
            });
            return;
        }

        if (selectedService !== "Delivery") {
            return;
        }

        const address = (shipAddressInput.value || "").trim();
        if (!address) {
            setMapStatus("Enter a shipping address first.", true);
            shipAddressInput.focus();
            return;
        }

        await geocodeAddress(address, { silent: false });
    });

    useLocationBtn.addEventListener("click", function () {
        if (selectedService !== "Delivery") {
            return;
        }

        if (!navigator.geolocation) {
            setMapStatus("Geolocation is not supported in this browser.", true);
            return;
        }

        setMapStatus("Getting your current location...", false);
        navigator.geolocation.getCurrentPosition(
            async function (position) {
                const lat = Number(position.coords.latitude);
                const lng = Number(position.coords.longitude);
                updateMapFrame(lat, lng, "Current location pinned on map.");

                try {
                    const resolvedAddress = await reverseGeocode(lat, lng);
                    if (resolvedAddress) {
                        shipAddressInput.value = resolvedAddress;
                        rememberedDeliveryAddress = resolvedAddress;
                        lastMappedAddressToken = resolvedAddress.toLowerCase();
                        setMapStatus("Current location and address loaded.", false);
                    }
                } catch (_error) {
                    setMapStatus("Location pinned, but address lookup is unavailable.", false);
                }
            },
            function (error) {
                if (error && error.code === error.PERMISSION_DENIED) {
                    setMapStatus("Location access denied. Enable location permission to use this feature.", true);
                    return;
                }
                setMapStatus("Unable to get your current location right now.", true);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });

    confirmBtn.addEventListener("click", async function () {
        if (!validateInputs()) {
            return;
        }

        if (selectedService === "Delivery" && !shippingCoords) {
            const resolved = await geocodeAddress(shipAddressInput.value, { silent: false });
            if (!resolved) {
                showError(shipAddressInput, "Please select a valid shipping location from the map.");
                return;
            }
        }

        const order = buildOrderDraft();

        if (String(order.payment || "").toLowerCase().includes("installment")) {
            localStorage.setItem(INSTALLMENT_CHECKOUT_KEY, JSON.stringify(order));
            localStorage.removeItem(INSTALLMENT_FORM_KEY);
            window.location.href = "../installment/installment-step1.html";
            return;
        }

        if (order.payment === "CASH ON DELIVERY") {
            await saveBooking(order);
            window.location.href = "success.html";
            return;
        }

        pendingOrder = order;
        openQrModal(order.payment, order.total, order);
    });

    qrClose.addEventListener("click", closeQrModal);
    qrModal.addEventListener("click", function (event) {
        if (event.target === qrModal) {
            closeQrModal();
        }
    });

    qrOpenApp.addEventListener("click", function () {
        openWalletApp(activeWalletContext);
    });

    qrDone.addEventListener("click", async function () {
        if (!pendingOrder) {
            closeQrModal();
            return;
        }

        await saveBooking(pendingOrder);
        pendingOrder = null;
        closeQrModal();
        window.location.href = "success.html";
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeQrModal();
        }
    });

    seedCustomerInfo();
    renderMapFrame(DEFAULT_MAP_COORDS.lat, DEFAULT_MAP_COORDS.lng);
    if (shipAddressInput.value) {
        geocodeAddress(shipAddressInput.value, { silent: true });
    }
    updateSummary();
})();
