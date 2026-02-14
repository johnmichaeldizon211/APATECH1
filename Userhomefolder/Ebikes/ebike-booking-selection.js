(function () {
    function parsePriceNumber(text) {
        if (!text) return 0;
        const match = String(text).match(/[\d,.]+/);
        if (!match) return 0;
        const value = Number(match[0].replace(/,/g, ""));
        return Number.isFinite(value) ? value : 0;
    }

    function getSubtitleByBikeId() {
        const match = window.location.pathname.match(/ebike(\d+)\.0\.html/i);
        const bikeId = match ? Number(match[1]) : 0;
        if (bikeId >= 1 && bikeId <= 8) return "2-Wheel";
        if (bikeId >= 9 && bikeId <= 12) return "3-Wheel";
        if (bikeId >= 13 && bikeId <= 16) return "4-Wheel";
        return "E-Bike";
    }

    function buildSelection() {
        const modelEl = document.querySelector(".model-title");
        const priceEl = document.querySelector(".price");
        const imageEl = document.getElementById("bike-image");
        const activeDot = document.querySelector(".dot.active");

        const modelText = modelEl ? modelEl.textContent : "";
        const model = modelText.replace(/^MODEL:\s*/i, "").trim() || "Ecodrive E-Bike";
        const total = parsePriceNumber(priceEl ? priceEl.textContent : "");

        const selectedImage =
            (activeDot && activeDot.dataset && activeDot.dataset.image) ||
            (imageEl ? imageEl.getAttribute("src") : "") ||
            "../image 1.png";

        return {
            model: model,
            total: total,
            image: selectedImage,
            bikeImage: selectedImage,
            subtitle: getSubtitleByBikeId()
        };
    }

    function persistSelection() {
        const selection = buildSelection();
        localStorage.setItem("ecodrive_checkout_selection", JSON.stringify(selection));
        localStorage.setItem("ecodrive_selected_bike", JSON.stringify(selection));
        localStorage.setItem("selectedBike", JSON.stringify(selection));
    }

    document.addEventListener(
        "click",
        function (event) {
            const button = event.target.closest(".check-btn");
            if (!button) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            persistSelection();

            const target = button.getAttribute("data-booking-url") || "../payment/booking.html";
            window.location.href = target;
        },
        true
    );
})();
