(function () {
    const INSTALLMENT_CHECKOUT_KEY = "ecodrive_installment_checkout";
    const INSTALLMENT_FORM_KEY = "ecodrive_installment_form";
    const KYC_API_BASE = (
        localStorage.getItem("ecodrive_kyc_api_base")
        || localStorage.getItem("ecodrive_api_base")
        || "http://127.0.0.1:5050"
    )
        .trim()
        .replace(/\/+$/, "");
    const FACE_MODEL_URLS = [
        "https://justadudewhohacks.github.io/face-api.js/models",
        "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model"
    ];
    const FACE_MATCH_THRESHOLD = 0.52;
    const ID_VERIFICATION_MAX_AGE_MS = 20 * 60 * 1000;
    const PH_LOCATION_TREE = {
        "Bulacan": {
            "Baliwag City": ["Bagong Nayon", "Concepcion", "Makinabang", "Poblacion", "Sabang"],
            "Malolos City": ["Anilao", "Atlag", "Bulihan", "Look 1st", "Santo Rosario"],
            "Meycauayan City": ["Banga", "Calvario", "Camalig", "Iba", "Perez"],
            "San Jose del Monte City": ["Assumption", "Citrus", "Dulong Bayan", "Graceville", "Muzon Proper"],
            "Plaridel": ["Agnaya", "Banga I", "Bagong Silang", "Lumang Bayan", "Poblacion"]
        },
        "Pampanga": {
            "Angeles City": ["Balibago", "Cutcut", "Lourdes Sur", "Pampang", "Pulung Maragul"],
            "City of San Fernando": ["Calulut", "Del Pilar", "Dolores", "San Agustin", "Santo Rosario"],
            "Mabalacat City": ["Dau", "Dolores", "Mawaque", "Poblacion", "Tabun"],
            "Apalit": ["Balucuc", "Capalangan", "Paligui", "Sampaloc", "San Vicente"]
        },
        "Cavite": {
            "Bacoor City": ["Bayanan", "Mambog I", "Molinio III", "Niog", "Talaba II"],
            "Dasmarinas City": ["Burol", "Langkaan I", "Paliparan I", "Poblacion", "Salitran II"],
            "Imus City": ["Alapan I-A", "Anabu I-A", "Bucandala I", "Medicion I-A", "Tanzang Luma I"],
            "General Trias City": ["Bagumbayan", "Biclatan", "Manggahan", "Santiago", "Tapia"]
        },
        "Laguna": {
            "Calamba City": ["Banadero", "Canlubang", "Halang", "Poblacion 1", "Real"],
            "San Pablo City": ["Santiago I", "San Antonio 1", "San Bartolome", "San Cristobal", "San Jose"],
            "Santa Rosa City": ["Balibago", "Caingin", "Dita", "Macabling", "Tagapo"],
            "Binan City": ["Canlalay", "Casile", "Malamig", "Poblacion", "San Antonio"]
        },
        "Rizal": {
            "Antipolo City": ["Cupang", "Dalig", "Dela Paz", "Mambugan", "San Isidro"],
            "Cainta": ["San Andres", "San Isidro", "San Juan", "Santo Domingo", "Santo Nino"],
            "Taytay": ["Dolores", "Muzon", "San Juan", "Santa Ana", "Tikling"],
            "Binangonan": ["Batingan", "Darangan", "Libis", "Pipindan", "Tatala"]
        },
        "Metro Manila": {
            "City of Manila": ["Binondo", "Ermita", "Malate", "Sampaloc", "Tondo I"],
            "Quezon City": ["Batasan Hills", "Commonwealth", "Novaliches Proper", "Pasong Tamo", "Tandang Sora"],
            "Makati City": ["Bel-Air", "Poblacion", "San Antonio", "San Isidro", "Tejeros"],
            "Pasig City": ["Bagong Ilog", "Kapitolyo", "Pinagbuhatan", "Rosario", "Santolan"],
            "Taguig City": ["Fort Bonifacio", "Lower Bicutan", "Pembo", "Pinagsama", "Western Bicutan"]
        }
    };
    const PSGC_API_BASE = "https://psgc.cloud/api/v2";
    const LOCATION_FETCH_TIMEOUT_MS = 15000;

    const profileBtn = document.querySelector(".profile-menu .profile-btn");
    const dropdown = document.querySelector(".profile-menu .dropdown");

    let activeStream = null;
    let faceModelsLoaded = false;

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

    function getApiUrl(endpoint) {
        return KYC_API_BASE ? `${KYC_API_BASE}${endpoint}` : endpoint;
    }

    function normalizeLocationText(value) {
        const raw = String(value || "").trim();
        if (!raw) {
            return "";
        }

        const fixed = raw
            .replace(/\u00C3\u00B1/g, "\u00F1")
            .replace(/\u00C3\u0091/g, "\u00D1")
            .replace(/\u00C3\u00A1/g, "\u00E1")
            .replace(/\u00C3\u00A9/g, "\u00E9")
            .replace(/\u00C3\u00AD/g, "\u00ED")
            .replace(/\u00C3\u00B3/g, "\u00F3")
            .replace(/\u00C3\u00BA/g, "\u00FA")
            .replace(/\u00C3\u00BC/g, "\u00FC")
            .replace(/\u00C2/g, "");

        if (fixed !== raw) {
            return fixed;
        }

        if (typeof TextDecoder === "function" && /[\u00C3\u00C2]/.test(raw)) {
            try {
                const bytes = new Uint8Array(Array.from(raw).map(function (char) {
                    return char.charCodeAt(0) & 255;
                }));
                const decoded = new TextDecoder("utf-8").decode(bytes).trim();
                if (decoded) {
                    return decoded;
                }
            } catch (_error) {
                return raw;
            }
        }

        return raw;
    }

    function normalizeLookupValue(value) {
        return normalizeLocationText(value).toLowerCase();
    }

    function findInsensitiveMatch(options, target) {
        const lookup = normalizeLookupValue(target);
        if (!lookup || !Array.isArray(options)) {
            return "";
        }

        for (let i = 0; i < options.length; i += 1) {
            if (normalizeLookupValue(options[i]) === lookup) {
                return String(options[i]);
            }
        }

        return "";
    }

    function toLocationArray(payload) {
        if (Array.isArray(payload)) {
            return payload;
        }
        if (payload && Array.isArray(payload.data)) {
            return payload.data;
        }
        if (payload && Array.isArray(payload.items)) {
            return payload.items;
        }
        if (payload && Array.isArray(payload.results)) {
            return payload.results;
        }
        return [];
    }

    function normalizeLocationRows(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map(function (row) {
                if (!row || typeof row !== "object") {
                    return null;
                }

                const name = normalizeLocationText(row.name || row.city || row.municipality || row.barangay || "");
                const code = String(row.code || row.psgc_code || row.id || name).trim();
                if (!name) {
                    return null;
                }

                return {
                    code: code || name,
                    name: name
                };
            })
            .filter(Boolean);
    }

    async function fetchLocationRows(url) {
        const controller = new AbortController();
        const timeout = setTimeout(function () {
            controller.abort();
        }, LOCATION_FETCH_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error("Location API unavailable.");
            }

            const payload = await response.json().catch(function () {
                return [];
            });
            return normalizeLocationRows(toLocationArray(payload));
        } finally {
            clearTimeout(timeout);
        }
    }

    function buildFallbackProvinceRows() {
        return Object.keys(PH_LOCATION_TREE)
            .sort(function (a, b) {
                return a.localeCompare(b);
            })
            .map(function (provinceName) {
                return {
                    code: "fallback:" + provinceName,
                    name: provinceName
                };
            });
    }

    function buildFallbackCityRows(provinceName) {
        const cityMap = PH_LOCATION_TREE[String(provinceName || "").trim()];
        if (!cityMap || typeof cityMap !== "object") {
            return [];
        }

        return Object.keys(cityMap)
            .sort(function (a, b) {
                return a.localeCompare(b);
            })
            .map(function (cityName) {
                return {
                    code: "fallback:" + provinceName + ":" + cityName,
                    name: cityName
                };
            });
    }

    function buildFallbackBarangayRows(provinceName, cityName) {
        const cityMap = PH_LOCATION_TREE[String(provinceName || "").trim()];
        const list = cityMap ? cityMap[String(cityName || "").trim()] : null;
        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .slice()
            .sort(function (a, b) {
                return String(a).localeCompare(String(b));
            })
            .map(function (barangayName) {
                return {
                    code: "fallback:" + provinceName + ":" + cityName + ":" + barangayName,
                    name: String(barangayName)
                };
            });
    }

    function renderSelectOptions(selectEl, options, placeholder, selectedValue) {
        if (!selectEl) {
            return "";
        }

        const normalizedOptions = Array.isArray(options)
            ? options.map(function (item) {
                return String(item || "").trim();
            }).filter(Boolean)
            : [];
        const uniqueOptions = Array.from(new Set(normalizedOptions));
        const selectedRaw = String(selectedValue || "").trim();
        const selectedMatch = findInsensitiveMatch(uniqueOptions, selectedRaw);

        selectEl.innerHTML = "";
        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.textContent = placeholder;
        selectEl.appendChild(placeholderOption);

        uniqueOptions.forEach(function (optionValue) {
            const option = document.createElement("option");
            option.value = optionValue;
            option.textContent = optionValue;
            selectEl.appendChild(option);
        });

        if (selectedMatch) {
            selectEl.value = selectedMatch;
            return selectedMatch;
        }

        if (selectedRaw) {
            const customOption = document.createElement("option");
            customOption.value = selectedRaw;
            customOption.textContent = selectedRaw;
            selectEl.appendChild(customOption);
            selectEl.value = selectedRaw;
            return selectedRaw;
        }

        selectEl.value = "";
        return "";
    }

    function setSelectLoadingState(selectEl, loadingText) {
        if (!selectEl) {
            return;
        }

        selectEl.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = loadingText;
        selectEl.appendChild(option);
        selectEl.disabled = true;
    }

    function setupStep2LocationSelectors(seedData) {
        const provinceSelect = document.getElementById("province");
        const citySelect = document.getElementById("city");
        const barangaySelect = document.getElementById("barangay");
        const cityCacheByProvinceCode = new Map();
        const barangayCacheByCityCode = new Map();
        let provinceRows = [];
        let cityRows = [];

        if (!provinceSelect || !citySelect || !barangaySelect) {
            return;
        }

        function buildNameCodeMap(rows) {
            const map = {};
            rows.forEach(function (row) {
                map[row.name] = row.code;
            });
            return map;
        }

        function getMatchedProvinceName() {
            return findInsensitiveMatch(
                provinceRows.map(function (row) {
                    return row.name;
                }),
                provinceSelect.value
            );
        }

        function getMatchedCityName() {
            return findInsensitiveMatch(
                cityRows.map(function (row) {
                    return row.name;
                }),
                citySelect.value
            );
        }

        async function loadProvinces(selectedProvince) {
            setSelectLoadingState(provinceSelect, "Loading provinces...");
            setSelectLoadingState(citySelect, "Select city / municipality");
            setSelectLoadingState(barangaySelect, "Select barangay");

            let rows = [];
            try {
                rows = await fetchLocationRows(PSGC_API_BASE + "/provinces");
            } catch (_error) {
                rows = [];
            }

            if (!rows.length) {
                rows = buildFallbackProvinceRows();
            }

            provinceRows = rows;
            const provinceNames = rows.map(function (row) {
                return row.name;
            });

            renderSelectOptions(
                provinceSelect,
                provinceNames,
                "Select province",
                selectedProvince
            );
            provinceSelect.disabled = false;
        }

        async function loadCities(provinceName, selectedCity, selectedBarangay) {
            const matchedProvinceName = findInsensitiveMatch(
                provinceRows.map(function (row) {
                    return row.name;
                }),
                provinceName
            );

            if (!matchedProvinceName) {
                cityRows = [];
                renderSelectOptions(citySelect, [], "Select city / municipality", "");
                renderSelectOptions(barangaySelect, [], "Select barangay", "");
                citySelect.disabled = true;
                barangaySelect.disabled = true;
                return;
            }

            const provinceCodeMap = buildNameCodeMap(provinceRows);
            const provinceCode = provinceCodeMap[matchedProvinceName];
            const cacheKey = provinceCode || matchedProvinceName;

            setSelectLoadingState(citySelect, "Loading cities / municipalities...");
            setSelectLoadingState(barangaySelect, "Select barangay");

            let rows = cityCacheByProvinceCode.get(cacheKey) || [];
            if (!rows.length) {
                if (String(cacheKey).startsWith("fallback:")) {
                    rows = buildFallbackCityRows(matchedProvinceName);
                } else {
                    try {
                        rows = await fetchLocationRows(
                            PSGC_API_BASE + "/provinces/" + encodeURIComponent(cacheKey) + "/cities-municipalities"
                        );
                    } catch (_error) {
                        rows = [];
                    }
                }

                if (!rows.length) {
                    rows = buildFallbackCityRows(matchedProvinceName);
                }
                cityCacheByProvinceCode.set(cacheKey, rows);
            }

            cityRows = rows;
            const cityNames = rows.map(function (row) {
                return row.name;
            });
            const chosenCity = renderSelectOptions(
                citySelect,
                cityNames,
                "Select city / municipality",
                selectedCity
            );
            citySelect.disabled = false;

            await loadBarangays(matchedProvinceName, chosenCity, selectedBarangay);
        }

        async function loadBarangays(provinceName, cityName, selectedBarangay) {
            const matchedCityName = findInsensitiveMatch(
                cityRows.map(function (row) {
                    return row.name;
                }),
                cityName
            );

            if (!matchedCityName) {
                renderSelectOptions(barangaySelect, [], "Select barangay", "");
                barangaySelect.disabled = true;
                return;
            }

            const cityCodeMap = buildNameCodeMap(cityRows);
            const cityCode = cityCodeMap[matchedCityName];
            const cacheKey = cityCode || matchedCityName;

            setSelectLoadingState(barangaySelect, "Loading barangays...");

            let rows = barangayCacheByCityCode.get(cacheKey) || [];
            if (!rows.length) {
                if (String(cacheKey).startsWith("fallback:")) {
                    rows = buildFallbackBarangayRows(provinceName, matchedCityName);
                } else {
                    try {
                        rows = await fetchLocationRows(
                            PSGC_API_BASE + "/cities-municipalities/" + encodeURIComponent(cacheKey) + "/barangays"
                        );
                    } catch (_error) {
                        rows = [];
                    }
                }

                if (!rows.length) {
                    rows = buildFallbackBarangayRows(provinceName, matchedCityName);
                }
                barangayCacheByCityCode.set(cacheKey, rows);
            }

            const barangayNames = rows.map(function (row) {
                return row.name;
            });
            renderSelectOptions(
                barangaySelect,
                barangayNames,
                "Select barangay",
                selectedBarangay
            );
            barangaySelect.disabled = false;
        }

        provinceSelect.addEventListener("change", function () {
            void loadCities(provinceSelect.value, "", "");
        });

        citySelect.addEventListener("change", function () {
            const matchedProvinceName = getMatchedProvinceName() || provinceSelect.value;
            const matchedCityName = getMatchedCityName() || citySelect.value;
            void loadBarangays(matchedProvinceName, matchedCityName, "");
        });

        void (async function initializeSelectors() {
            await loadProvinces(seedData && seedData.province);
            await loadCities(
                provinceSelect.value,
                seedData && seedData.city,
                seedData && seedData.barangay
            );
        })();
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

    function getCheckoutDraft() {
        const parsed = safeParse(localStorage.getItem(INSTALLMENT_CHECKOUT_KEY));
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return parsed;
    }

    function getInstallmentFormData() {
        const parsed = safeParse(localStorage.getItem(INSTALLMENT_FORM_KEY));
        if (parsed && typeof parsed === "object") {
            return parsed;
        }
        return {};
    }

    function setInstallmentFormData(nextData) {
        localStorage.setItem(INSTALLMENT_FORM_KEY, JSON.stringify(nextData));
    }

    function redirectToBooking() {
        window.location.href = "../payment/booking.html";
    }

    function stopActiveStream() {
        if (!activeStream) {
            return;
        }

        activeStream.getTracks().forEach(function (track) {
            track.stop();
        });
        activeStream = null;
    }

    window.addEventListener("beforeunload", stopActiveStream);

    const step = document.body.getAttribute("data-step");
    if (step !== "4" && !getCheckoutDraft()) {
        redirectToBooking();
        return;
    }

    function dataUrlToImage(dataUrl) {
        return new Promise(function (resolve, reject) {
            const image = new Image();
            image.onload = function () {
                resolve(image);
            };
            image.onerror = function () {
                reject(new Error("Failed to load image."));
            };
            image.src = dataUrl;
        });
    }

    async function startCamera(videoEl, facingMode) {
        if (!window.isSecureContext) {
            throw new Error("Camera requires HTTPS on mobile. Open this page using an https:// URL.");
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera is not supported by this browser.");
        }

        stopActiveStream();
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: facingMode || "user" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        activeStream = stream;
        videoEl.srcObject = stream;
        await videoEl.play();
    }

    function formatCameraError(error) {
        const name = String(error && error.name ? error.name : "");
        const message = String(error && error.message ? error.message : "");

        if (!window.isSecureContext) {
            return "Camera needs HTTPS on mobile. Use an https:// URL.";
        }
        if (name === "NotAllowedError") {
            return "Camera permission denied. Allow camera access in browser settings.";
        }
        if (name === "NotFoundError") {
            return "No camera detected on this device.";
        }
        if (name === "NotReadableError") {
            return "Camera is busy. Close other apps using camera and try again.";
        }
        if (name === "SecurityError") {
            return "Camera access blocked. Use HTTPS and allow permissions.";
        }
        return message || "Unable to open camera.";
    }

    function captureFrame(videoEl, canvasEl) {
        if (!videoEl || !canvasEl || !videoEl.videoWidth || !videoEl.videoHeight) {
            return "";
        }

        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        const ctx = canvasEl.getContext("2d");
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        canvasEl.classList.add("show");
        return canvasEl.toDataURL("image/jpeg", 0.92);
    }

    function setStatus(target, text, type) {
        if (!target) {
            return;
        }

        target.textContent = text;
        target.classList.remove("pending", "running", "success", "error");
        target.classList.add(type || "pending");
    }

    function normalizeOcrText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function getIdKeywordsByType(idType) {
        switch (idType) {
            case "Passport":
                return ["passport", "republic of the philippines", "department of foreign affairs"];
            case "Driver License":
                return ["driver", "license", "land transportation office", "philippines"];
            case "National ID":
                return ["philippine identification", "philsys", "republic of the philippines", "national id"];
            case "UMID":
                return ["umid", "social security system", "government service insurance system", "sss"];
            default:
                return [];
        }
    }

    function countKeywordMatches(text, keywords) {
        return keywords.reduce(function (count, keyword) {
            return text.includes(keyword) ? count + 1 : count;
        }, 0);
    }

    function getIdNumberPatterns(idType) {
        switch (idType) {
            case "Passport":
                return [/\b[A-Z]\d{7}[A-Z]?\b/i];
            case "Driver License":
                return [/\b[A-Z]\d{2}-\d{2}-\d{6}\b/i, /\b\d{11,12}\b/];
            case "National ID":
                return [/\b\d{4}\s?\d{4}\s?\d{4}\b/];
            case "UMID":
                return [/\b\d{4}-\d{7}-\d\b/, /\b\d{12}\b/];
            default:
                return [/\b[A-Z0-9]{7,18}\b/i];
        }
    }

    function hasLikelyIdNumberByType(idType, text) {
        const source = String(text || "").replace(/\s+/g, " ").trim();
        const patterns = getIdNumberPatterns(idType);
        return patterns.some(function (pattern) {
            return pattern.test(source);
        });
    }

    function createKycFlowId() {
        return "kyc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }

    function isRecentIsoTimestamp(value, maxAgeMs) {
        const stamp = Date.parse(String(value || ""));
        if (!Number.isFinite(stamp)) {
            return false;
        }
        return (Date.now() - stamp) <= Number(maxAgeMs || 0);
    }

    async function runOcr(imageDataUrl) {
        if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
            throw new Error("OCR engine is not available.");
        }

        const result = await window.Tesseract.recognize(imageDataUrl, "eng", {
            logger: function () {
                // Silent OCR progress.
            }
        });
        return {
            text: result && result.data && result.data.text ? result.data.text : "",
            confidence: result && result.data && Number.isFinite(Number(result.data.confidence))
                ? Number(result.data.confidence)
                : 0
        };
    }

    async function loadFaceModels() {
        if (faceModelsLoaded) {
            return;
        }

        if (!window.faceapi) {
            throw new Error("Face matcher library is not loaded.");
        }

        let loaded = false;
        let lastError = null;

        for (let i = 0; i < FACE_MODEL_URLS.length; i += 1) {
            try {
                await Promise.all([
                    window.faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URLS[i]),
                    window.faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URLS[i]),
                    window.faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URLS[i])
                ]);
                loaded = true;
                break;
            } catch (err) {
                lastError = err;
            }
        }

        if (!loaded) {
            throw lastError || new Error("Unable to load face recognition models.");
        }

        faceModelsLoaded = true;
    }

    async function detectFaceDescriptors(dataUrl) {
        await loadFaceModels();
        const image = await dataUrlToImage(dataUrl);

        const detections = await window.faceapi
            .detectAllFaces(
                image,
                new window.faceapi.TinyFaceDetectorOptions({
                    inputSize: 320,
                    scoreThreshold: 0.45
                })
            )
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (!Array.isArray(detections) || detections.length < 1) {
            return [];
        }

        return detections
            .map(function (item) {
                return item && item.descriptor ? item.descriptor : null;
            })
            .filter(Boolean);
    }

    async function callKycApi(endpoint, payload) {
        const controller = new AbortController();
        const timeout = setTimeout(function () {
            controller.abort();
        }, 18000);

        try {
            const response = await fetch(getApiUrl(endpoint), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error("KYC API returned " + response.status);
            }

            const parsed = await response.json();
            if (!parsed || typeof parsed !== "object") {
                throw new Error("Invalid KYC API response");
            }

            return parsed;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function verifyIdLocally(idType, idDataUrl) {
        const results = await Promise.all([
            runOcr(idDataUrl),
            detectFaceDescriptors(idDataUrl)
        ]);
        const ocr = results[0];
        const idFaceDescriptors = results[1];
        const normalized = normalizeOcrText(ocr.text);
        const keywords = getIdKeywordsByType(idType);

        const keywordMatches = countKeywordMatches(normalized, keywords);
        const minimumKeywordHits = keywords.length >= 3 ? 2 : 1;
        const hasRequiredKeyword = keywordMatches >= minimumKeywordHits;
        const hasEnoughText = normalized.replace(/\s/g, "").length >= 34;
        const hasReadableOcrConfidence = Number(ocr.confidence || 0) >= 40;
        const hasIdNumber = hasLikelyIdNumberByType(idType, normalized);

        if (!hasRequiredKeyword) {
            return {
                verified: false,
                reason: "ID text does not match the selected ID type.",
                faceDescriptor: null
            };
        }
        if (!hasEnoughText) {
            return {
                verified: false,
                reason: "ID scan is unclear. Please capture a clearer image.",
                faceDescriptor: null
            };
        }
        if (!hasReadableOcrConfidence) {
            return {
                verified: false,
                reason: "ID text is unreadable. Please scan in brighter lighting.",
                faceDescriptor: null
            };
        }
        if (!hasIdNumber) {
            return {
                verified: false,
                reason: "No valid ID number pattern detected.",
                faceDescriptor: null
            };
        }
        if (!Array.isArray(idFaceDescriptors) || idFaceDescriptors.length < 1) {
            return {
                verified: false,
                reason: "No face detected on the scanned ID.",
                faceDescriptor: null
            };
        }
        if (idFaceDescriptors.length > 1) {
            return {
                verified: false,
                reason: "Multiple faces detected on ID image. Capture only one ID in frame.",
                faceDescriptor: null
            };
        }

        return {
            verified: true,
            reason: "ID verified by local engine.",
            faceDescriptor: idFaceDescriptors[0]
        };
    }

    async function verifyFaceLocally(idImageDataUrl, selfieDataUrl) {
        const detections = await Promise.all([
            detectFaceDescriptors(idImageDataUrl),
            detectFaceDescriptors(selfieDataUrl)
        ]);
        const idFaceDescriptors = detections[0];
        const selfieFaceDescriptors = detections[1];

        if (!Array.isArray(idFaceDescriptors) || idFaceDescriptors.length < 1) {
            return {
                verified: false,
                reason: "No face found in verified ID image.",
                distance: null
            };
        }
        if (idFaceDescriptors.length > 1) {
            return {
                verified: false,
                reason: "Multiple faces found in the ID image.",
                distance: null
            };
        }

        if (!Array.isArray(selfieFaceDescriptors) || selfieFaceDescriptors.length < 1) {
            return {
                verified: false,
                reason: "No face detected in selfie scan.",
                distance: null
            };
        }
        if (selfieFaceDescriptors.length > 1) {
            return {
                verified: false,
                reason: "Multiple faces detected in selfie frame. Make sure only you are visible.",
                distance: null
            };
        }

        const distance = window.faceapi.euclideanDistance(idFaceDescriptors[0], selfieFaceDescriptors[0]);

        if (distance > FACE_MATCH_THRESHOLD) {
            return {
                verified: false,
                reason: "Face mismatch detected. Please scan again.",
                distance: distance
            };
        }

        return {
            verified: true,
            reason: "Face matched with scanned ID.",
            distance: distance
        };
    }

    async function verifyIdWithApiOrFallback(idType, idDataUrl) {
        try {
            const apiResult = await callKycApi("/api/kyc/verify-id", {
                idType: idType,
                idImage: idDataUrl
            });

            if (typeof apiResult.verified !== "boolean") {
                throw new Error("KYC API invalid response payload.");
            }

            if (apiResult.verified) {
                const local = await verifyIdLocally(idType, idDataUrl);
                if (!local.verified) {
                    return {
                        verified: false,
                        reason: local.reason,
                        source: "local"
                    };
                }
            }

            return {
                verified: !!apiResult.verified,
                reason: String(apiResult.reason || (apiResult.verified ? "ID verified by API." : "ID not verified.")),
                verificationToken: String(apiResult.verificationToken || ""),
                source: "api"
            };
        } catch (_apiError) {
            const localResult = await verifyIdLocally(idType, idDataUrl);
            return {
                verified: localResult.verified,
                reason: localResult.verified
                    ? "ID verified using local fallback engine."
                    : localResult.reason,
                source: "local-fallback"
            };
        }
    }

    async function verifyFaceWithApiOrFallback(idImageDataUrl, selfieDataUrl, idType, verificationToken) {
        try {
            const apiResult = await callKycApi("/api/kyc/verify-face", {
                idType: idType,
                idImage: idImageDataUrl,
                selfieImage: selfieDataUrl,
                verificationToken: verificationToken || ""
            });

            if (typeof apiResult.verified !== "boolean") {
                throw new Error("KYC API invalid response payload.");
            }

            if (apiResult.verified) {
                const local = await verifyFaceLocally(idImageDataUrl, selfieDataUrl);
                if (!local.verified) {
                    return {
                        verified: false,
                        reason: local.reason,
                        distance: local.distance,
                        source: "local-cross-check"
                    };
                }
                return {
                    verified: true,
                    reason: String(apiResult.reason || "Face verified by API and local matcher."),
                    distance: Number.isFinite(Number(local.distance)) ? Number(local.distance) : Number(apiResult.distance || 0),
                    source: "api+local"
                };
            }

            return {
                verified: false,
                reason: String(apiResult.reason || "Face verification failed."),
                distance: Number(apiResult.distance || 0),
                source: "api"
            };
        } catch (_apiError) {
            const localResult = await verifyFaceLocally(idImageDataUrl, selfieDataUrl);
            return {
                verified: localResult.verified,
                reason: localResult.verified
                    ? "Face verified using local fallback engine."
                    : localResult.reason,
                distance: localResult.distance,
                source: "local-fallback"
            };
        }
    }

    function seedStep2() {
        const data = getInstallmentFormData();
        const fields = [
            "firstName", "middleName", "lastName", "gender", "age", "personalEmail",
            "cellphone", "zipCode", "street", "civilStatus", "dob",
            "nationality", "monthsToPay"
        ];

        fields.forEach(function (fieldId) {
            const input = document.getElementById(fieldId);
            if (input && data[fieldId]) {
                input.value = data[fieldId];
            }
        });

        const draft = getCheckoutDraft();
        const emailInput = document.getElementById("personalEmail");
        if (emailInput && !emailInput.value && draft && draft.email) {
            emailInput.value = draft.email;
        }

        return data;
    }

    function seedStep3() {
        const data = getInstallmentFormData();
        const fields = ["currentEmployer", "companyAddress", "natureOfWork", "monthlyIncome", "position"];

        fields.forEach(function (fieldId) {
            const input = document.getElementById(fieldId);
            if (input && data[fieldId]) {
                input.value = data[fieldId];
            }
        });
    }

    async function appendBookingRecord(record) {
        await saveBookingToApi(record);
        let existing = [];
        try {
            const parsed = safeParse(localStorage.getItem("ecodrive_bookings"));
            if (Array.isArray(parsed)) {
                existing = parsed;
            }
        } catch (_error) {
            existing = [];
        }

        existing.push(record);
        localStorage.setItem("ecodrive_bookings", JSON.stringify(existing));
        localStorage.setItem("latestBooking", JSON.stringify(record));
    }

    function setupStep1Notice() {
        const form = document.getElementById("installmentNoticeForm");
        const reminderAgree = document.getElementById("photoReminderAgree");
        const error = document.getElementById("idStepError");

        if (!form) {
            return;
        }

        const existing = getInstallmentFormData();

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            if (error) {
                error.textContent = "";
            }

            if (!reminderAgree || !reminderAgree.checked) {
                if (error) {
                    error.textContent = "Please confirm that you will bring a 2x2 picture.";
                }
                return;
            }

            const timestamp = new Date().toISOString();
            const next = {
                ...existing,
                idType: "Manual 2x2 Picture Requirement",
                kycFlowId: existing.kycFlowId || createKycFlowId(),
                kycFlowStage: "face-verified",
                idVerified: true,
                idImageDataUrl: "",
                idVerificationToken: "",
                idVerificationSource: "manual-requirement",
                idVerificationReason: "Customer reminded to bring a 2x2 picture.",
                idVerifiedAt: timestamp,
                faceVerified: true,
                faceDistance: "",
                faceVerifiedAt: timestamp,
                identityVerifiedAt: timestamp,
                termsAgree: true,
                manualPhotoReminder: true
            };

            setInstallmentFormData(next);
            window.location.href = "installment-step2.html";
        });
    }

    function setupStep1Id() {
        const form = document.getElementById("installmentIdForm");
        const idType = document.getElementById("idType");
        const error = document.getElementById("idStepError");
        const idVideo = document.getElementById("idVideo");
        const idCanvas = document.getElementById("idCanvas");
        const openIdCameraBtn = document.getElementById("openIdCameraBtn");
        const captureIdBtn = document.getElementById("captureIdBtn");
        const idStatus = document.getElementById("idStatus");

        if (!form) {
            return;
        }

        const existing = getInstallmentFormData();
        const scanState = {
            idVerified: !!existing.idVerified,
            idImageDataUrl: existing.idImageDataUrl || "",
            idVerificationToken: existing.idVerificationToken || "",
            idVerificationSource: existing.idVerificationSource || "",
            idReason: existing.idVerificationReason || ""
        };

        if (existing.idType) {
            idType.value = existing.idType;
        }

        if (scanState.idVerified) {
            setStatus(idStatus, "ID already verified. You can proceed.", "success");
        }

        idType.addEventListener("change", function () {
            scanState.idVerified = false;
            scanState.idImageDataUrl = "";
            scanState.idVerificationToken = "";
            scanState.idVerificationSource = "";
            scanState.idReason = "";
            idCanvas.classList.remove("show");
            setStatus(idStatus, "ID not verified yet.", "pending");
        });

        openIdCameraBtn.addEventListener("click", async function () {
            if (error) {
                error.textContent = "";
            }
            try {
                await startCamera(idVideo, "environment");
                setStatus(idStatus, "Camera ready. Place ID in frame then click Scan ID.", "running");
            } catch (cameraError) {
                setStatus(idStatus, formatCameraError(cameraError), "error");
            }
        });

        captureIdBtn.addEventListener("click", async function () {
            if (error) {
                error.textContent = "";
            }

            if (!idType.value) {
                if (error) {
                    error.textContent = "Select ID type before scanning.";
                }
                idType.focus();
                return;
            }

            const idDataUrl = captureFrame(idVideo, idCanvas);
            if (!idDataUrl) {
                setStatus(idStatus, "No camera frame available. Open camera first.", "error");
                return;
            }

            setStatus(idStatus, "Checking ID legitimacy using verification system...", "running");

            try {
                const verdict = await verifyIdWithApiOrFallback(idType.value, idDataUrl);
                if (!verdict.verified) {
                    scanState.idVerified = false;
                    setStatus(idStatus, verdict.reason, "error");
                    return;
                }

                scanState.idVerified = true;
                scanState.idImageDataUrl = idDataUrl;
                scanState.idVerificationToken = verdict.verificationToken || "";
                scanState.idVerificationSource = verdict.source || "unknown";
                scanState.idReason = verdict.reason || "";
                setStatus(idStatus, verdict.reason + " (" + scanState.idVerificationSource + ")", "success");
            } catch (verifyError) {
                scanState.idVerified = false;
                setStatus(idStatus, verifyError.message || "ID verification failed.", "error");
            }
        });

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (error) {
                error.textContent = "";
            }

            if (!idType.value) {
                if (error) {
                    error.textContent = "Please select your ID type.";
                }
                return;
            }

            if (!scanState.idVerified || !scanState.idImageDataUrl) {
                if (error) {
                    error.textContent = "ID must be scanned and verified before proceeding.";
                }
                return;
            }

            const next = {
                ...existing,
                idType: idType.value,
                kycFlowId: createKycFlowId(),
                kycFlowStage: "id-verified",
                idVerified: true,
                idImageDataUrl: scanState.idImageDataUrl,
                idVerificationToken: scanState.idVerificationToken,
                idVerificationSource: scanState.idVerificationSource,
                idVerificationReason: scanState.idReason,
                idVerifiedAt: new Date().toISOString(),
                faceVerified: false,
                faceDistance: "",
                faceVerifiedAt: "",
                identityVerifiedAt: "",
                termsAgree: false
            };

            setInstallmentFormData(next);
            stopActiveStream();
            window.location.href = "installment-face-scan.html";
        });
    }

    function setupStep1Face() {
        const form = document.getElementById("installmentFaceForm");
        const termsAgree = document.getElementById("termsAgree");
        const error = document.getElementById("faceStepError");
        const faceVideo = document.getElementById("faceVideo");
        const faceCanvas = document.getElementById("faceCanvas");
        const openFaceCameraBtn = document.getElementById("openFaceCameraBtn");
        const captureFaceBtn = document.getElementById("captureFaceBtn");
        const faceStatus = document.getElementById("faceStatus");
        const verifiedIdType = document.getElementById("verifiedIdType");

        if (!form) {
            return;
        }

        const existing = getInstallmentFormData();
        const isIdFresh = isRecentIsoTimestamp(existing.idVerifiedAt, ID_VERIFICATION_MAX_AGE_MS);
        if (!existing.idVerified || !existing.idType || !existing.idImageDataUrl || !isIdFresh) {
            window.location.href = "installment-step1.html";
            return;
        }

        if (verifiedIdType) {
            verifiedIdType.textContent = existing.idType;
        }

        if (existing.termsAgree) {
            termsAgree.checked = true;
        }

        const scanState = {
            faceVerified: !!existing.faceVerified,
            faceDistance: existing.faceDistance || "",
            selfieDataUrl: ""
        };

        if (scanState.faceVerified) {
            setStatus(faceStatus, "Face already verified. You can register now.", "success");
        }

        openFaceCameraBtn.addEventListener("click", async function () {
            if (error) {
                error.textContent = "";
            }

            try {
                await startCamera(faceVideo, "user");
                setStatus(faceStatus, "Camera ready. Face forward then click Scan Face.", "running");
            } catch (cameraError) {
                setStatus(faceStatus, formatCameraError(cameraError), "error");
            }
        });

        captureFaceBtn.addEventListener("click", async function () {
            if (error) {
                error.textContent = "";
            }

            const selfieDataUrl = captureFrame(faceVideo, faceCanvas);
            if (!selfieDataUrl) {
                setStatus(faceStatus, "No camera frame available. Open camera first.", "error");
                return;
            }

            scanState.faceVerified = false;
            scanState.selfieDataUrl = selfieDataUrl;
            setStatus(faceStatus, "Matching selfie to verified ID...", "running");

            try {
                const verdict = await verifyFaceWithApiOrFallback(
                    existing.idImageDataUrl,
                    selfieDataUrl,
                    existing.idType,
                    existing.idVerificationToken
                );

                if (!verdict.verified) {
                    setStatus(faceStatus, verdict.reason, "error");
                    return;
                }

                scanState.faceVerified = true;
                scanState.faceDistance = Number(verdict.distance || 0).toFixed(3);
                setStatus(faceStatus, verdict.reason + " (" + (verdict.source || "unknown") + ")", "success");
            } catch (verifyError) {
                setStatus(faceStatus, verifyError.message || "Face verification failed.", "error");
            }
        });

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (error) {
                error.textContent = "";
            }

            if (!scanState.faceVerified) {
                if (error) {
                    error.textContent = "Face scan must match the verified ID before proceeding.";
                }
                return;
            }

            if (!termsAgree.checked) {
                if (error) {
                    error.textContent = "Please agree to the terms and conditions.";
                }
                termsAgree.focus();
                return;
            }

            const next = {
                ...existing,
                termsAgree: true,
                faceVerified: true,
                faceDistance: scanState.faceDistance,
                kycFlowStage: "face-verified",
                faceVerifiedAt: new Date().toISOString(),
                identityVerifiedAt: new Date().toISOString()
            };
            setInstallmentFormData(next);
            stopActiveStream();
            window.location.href = "installment-step2.html";
        });
    }

    function setupStep2() {
        const identity = getInstallmentFormData();
        if (!identity.idVerified || !identity.faceVerified || identity.kycFlowStage !== "face-verified") {
            window.location.href = "installment-step1.html";
            return;
        }

        const form = document.getElementById("installmentStep2Form");
        const error = document.getElementById("step2Error");
        if (!form) {
            return;
        }

        const seededData = seedStep2();
        setupStep2LocationSelectors(seededData);

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            if (error) {
                error.textContent = "";
            }

            const data = {
                firstName: (document.getElementById("firstName").value || "").trim(),
                middleName: (document.getElementById("middleName").value || "").trim(),
                lastName: (document.getElementById("lastName").value || "").trim(),
                gender: (document.getElementById("gender").value || "").trim(),
                age: (document.getElementById("age").value || "").trim(),
                personalEmail: (document.getElementById("personalEmail").value || "").trim(),
                province: (document.getElementById("province").value || "").trim(),
                cellphone: (document.getElementById("cellphone").value || "").trim(),
                zipCode: (document.getElementById("zipCode").value || "").trim(),
                street: (document.getElementById("street").value || "").trim(),
                city: (document.getElementById("city").value || "").trim(),
                barangay: (document.getElementById("barangay").value || "").trim(),
                civilStatus: (document.getElementById("civilStatus").value || "").trim(),
                dob: (document.getElementById("dob").value || "").trim(),
                nationality: (document.getElementById("nationality").value || "").trim(),
                monthsToPay: (document.getElementById("monthsToPay").value || "").trim()
            };

            if (!data.firstName || !data.lastName || !data.gender || !data.age || !data.personalEmail || !data.province || !data.cellphone || !data.zipCode || !data.street || !data.city || !data.barangay || !data.civilStatus || !data.dob || !data.nationality || !data.monthsToPay) {
                if (error) {
                    error.textContent = "Please complete all required fields.";
                }
                return;
            }

            const ageValue = Number(data.age);
            if (!Number.isFinite(ageValue) || ageValue < 18) {
                if (error) {
                    error.textContent = "Applicant must be at least 18 years old.";
                }
                return;
            }

            const merged = {
                ...getInstallmentFormData(),
                ...data
            };
            setInstallmentFormData(merged);
            window.location.href = "installment-step3.html";
        });
    }

    function setupStep3() {
        const identity = getInstallmentFormData();
        if (!identity.idVerified || !identity.faceVerified || identity.kycFlowStage !== "face-verified") {
            window.location.href = "installment-step1.html";
            return;
        }

        const form = document.getElementById("installmentStep3Form");
        const error = document.getElementById("step3Error");
        if (!form) {
            return;
        }

        seedStep3();

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (error) {
                error.textContent = "";
            }

            const employment = {
                currentEmployer: (document.getElementById("currentEmployer").value || "").trim(),
                companyAddress: (document.getElementById("companyAddress").value || "").trim(),
                natureOfWork: (document.getElementById("natureOfWork").value || "").trim(),
                monthlyIncome: (document.getElementById("monthlyIncome").value || "").trim(),
                position: (document.getElementById("position").value || "").trim()
            };

            if (!employment.currentEmployer || !employment.companyAddress || !employment.natureOfWork || !employment.monthlyIncome || !employment.position) {
                if (error) {
                    error.textContent = "Please complete all required fields.";
                }
                return;
            }

            const merged = {
                ...getInstallmentFormData(),
                ...employment,
                submittedAt: new Date().toISOString()
            };
            setInstallmentFormData(merged);

            const draft = getCheckoutDraft();
            if (!draft) {
                redirectToBooking();
                return;
            }

            const bookingRecord = {
                orderId: draft.orderId,
                fullName: draft.fullName,
                email: draft.email,
                phone: draft.phone,
                model: draft.model,
                bikeImage: draft.bikeImage,
                total: draft.total,
                payment: draft.payment,
                service: "Installment",
                status: "Application Review",
                fulfillmentStatus: "Under Review",
                createdAt: new Date().toISOString(),
                installment: merged
            };

            await appendBookingRecord(bookingRecord);
            localStorage.removeItem(INSTALLMENT_CHECKOUT_KEY);
            window.location.href = "installment-success.html";
        });
    }

    if (step === "1-id") {
        setupStep1Notice();
    }

    if (step === "1-face") {
        window.location.href = "installment-step1.html";
        return;
    }

    if (step === "2") {
        setupStep2();
    }

    if (step === "3") {
        setupStep3();
    }

    if (step === "4") {
        localStorage.removeItem(INSTALLMENT_FORM_KEY);
    }
})();

