"use strict";

(() => {
    /**
     * Enum for UI status alert severity levels.
     * @readonly
     * @enum {string}
     */
    const StatusType = Object.freeze({
        INFO: "info",
        SUCCESS: "success",
        WARNING: "warning",
        ERROR: "error",
    });

    /**
     * Primary button element used to prompt for and pair new USB devices.
     * @type {HTMLButtonElement | null}
     */
    let requestBtn = null;

    /**
     * Secondary button element used to manually refresh paired devices.
     * @type {HTMLButtonElement | null}
     */
    let refreshBtn = null;

    /**
     * Live region container element displaying user status notifications.
     * @type {HTMLElement | null}
     */
    let statusBox = null;

    /**
     * Unordered list element containing rendered device cards.
     * @type {HTMLUListElement | null}
     */
    let deviceList = null;

    /**
     * Monotonically increasing sequence ID to prevent out-of-order async UI updates.
     * @type {number}
     */
    let currentUpdateId = 0;

    /**
     * Flag indicating whether an asynchronous USB operation is in flight.
     * @type {boolean}
     */
    let isOperationInProgress = false;

    /**
     * Flag indicating whether a hardware attach/detach event arrived while an operation was in flight.
     * @type {boolean}
     */
    let pendingRefresh = false;

    /**
     * Stores the target focus element criteria to restore focus after DOM re-renders.
     * @type {{ deviceKey: string | null, fallbackKey?: string | null, buttonSelector?: string | null, action: string } | null}
     */
    let pendingFocus = null;

    /**
     * WeakMap associating USBDevice instances with stable runtime session keys.
     * @type {WeakMap<USBDevice, string>}
     */
    const deviceSessionKeys = new WeakMap();

    /**
     * Formats hexadecimal numbers with configurable zero-padding.
     * 
     * @param {number} val - Number to format in hex.
     * @param {number} [pad=4] - Target character width for zero padding.
     * @returns {string} Formatted hex string (e.g., 0x18D1, 0xFF).
     */
    function formatHex(val, pad = 4) {
        if (typeof val !== "number" || !Number.isFinite(val)) {
            return "0x" + "0".repeat(Math.max(0, pad));
        }

        const sanitized = Math.max(0, Math.min(0xffffffff, Math.trunc(val)));
        return "0x" + sanitized.toString(16).padStart(pad, "0").toUpperCase();
    }

    /**
     * Formats a major, minor, and subminor version triplet safely with nullish coalescing.
     * 
     * @param {number} [major=0] - Major version number.
     * @param {number} [minor=0] - Minor version number.
     * @param {number} [subminor=0] - Subminor version number.
     * @returns {string} Formatted version string (e.g., 2.0.0).
     */
    function formatVersion(major = 0, minor = 0, subminor = 0) {
        return `${major ?? 0}.${minor ?? 0}.${subminor ?? 0}`;
    }

    /**
     * Extracts a readable error message from an unknown caught exception.
     * 
     * @param {unknown} err - Captured error object or value.
     * @returns {string} Normalized error message.
     */
    function getErrorMessage(err) {
        return err instanceof Error ? err.message : String(err);
    }

    /**
     * Resolves a human-readable display name for a USB device.
     * 
     * @param {USBDevice} device - The WebUSB device instance.
     * @returns {string} Human-readable device name.
     */
    function getDeviceName(device) {
        if (!device) {
            return "USB Device";
        }
        
        return device.productName || `USB Device (${formatHex(device.vendorId)}:${formatHex(device.productId)})`;
    }

    /**
     * Computes a deterministic descriptor fingerprint for a USB device instance.
     * 
     * @param {USBDevice} device - USB device instance.
     * @returns {string} Descriptor fingerprint.
     */
    function getDeviceFingerprint(device) {
        if (!device) {
            return "";
        }

        const vid = formatHex(device.vendorId);
        const pid = formatHex(device.productId);
        
        if (device.serialNumber) {
            return `${vid}:${pid}:serialNumber-${device.serialNumber}`;
        }

        const usbVersion = formatVersion(device.usbVersionMajor, device.usbVersionMinor, device.usbVersionSubminor);
        const deviceVersion = formatVersion(device.deviceVersionMajor, device.deviceVersionMinor, device.deviceVersionSubminor);
        const name = device.productName || "";
        const manufacturer = device.manufacturerName || "";
        const deviceClass = `${device.deviceClass}:${device.deviceSubclass}:${device.deviceProtocol}`;

        return `${vid}:${pid}:description-${name}-${manufacturer}-${usbVersion}-${deviceVersion}-${deviceClass}`;
    }

    /**
     * Retrieves or assigns a stable identifier for a USB device instance.
     * 
     * @param {USBDevice} device - USB device instance.
     * @param {number} [disambiguationIndex=0] - Disambiguation index for identical devices lacking serial numbers.
     * @returns {string} Unique identifier string.
     */
    function getDeviceKey(device, disambiguationIndex = 0) {
        if (!device) {
            return "";
        }

        let key = deviceSessionKeys.get(device);

        if (!key) {
            const base = getDeviceFingerprint(device);
            key = disambiguationIndex > 0 ? `${base}#${disambiguationIndex}` : base;
            deviceSessionKeys.set(device, key);
        }
    
        return key;
    }

    /**
     * Finds the stable key of the nearest sibling device card to preserve keyboard focus.
     * 
     * @param {Element | null} card - Reference card element.
     * @returns {string | null} Dataset device key of the successor card, or null if none.
     */
    function findSuccessorKey(card) {
        if (!card) {
            return null;
        }

        const nextCard = card.nextElementSibling;
        const prevCard = card.previousElementSibling;
        const successorCard = (nextCard?.classList.contains("device-card") ? nextCard : null)
            || (prevCard?.classList.contains("device-card") ? prevCard : null);
            
        return successorCard?.dataset.deviceKey || null;
    }

    /**
     * Restores keyboard focus to the appropriate device action button or fallback control.
     */
    function restoreFocus() {
        if (!pendingFocus) {
            return;
        }

        const { deviceKey: targetKey, fallbackKey, buttonSelector, action: targetAction } = pendingFocus;
        pendingFocus = null;

        if (targetAction === "preserve") {
            const primaryCard = targetKey
                ? deviceList?.querySelector(`[data-device-key="${CSS.escape(targetKey)}"]`)
                : null;
            const fallbackCard = (!primaryCard && fallbackKey)
                ? deviceList?.querySelector(`[data-device-key="${CSS.escape(fallbackKey)}"]`)
                : null;
            const targetCard = primaryCard || fallbackCard;

            if (targetCard) {
                const btn = (buttonSelector ? targetCard.querySelector(buttonSelector) : null)
                    || targetCard.querySelector("button");
                if (btn) {
                    btn.focus();
                    return;
                }
            }

            if (requestBtn) {
                requestBtn.focus();
            }
            return;
        }

        if (targetAction === "forget" || targetAction === "disconnect") {
            const targetCard = targetKey
                ? deviceList?.querySelector(`[data-device-key="${CSS.escape(targetKey)}"]`)
                : null;
            const successorBtn = targetCard?.querySelector("button");
            if (successorBtn) {
                successorBtn.focus();
            } else if (requestBtn) {
                requestBtn.focus();
            }
        } else {
            const targetCard = targetKey
                ? deviceList?.querySelector(`[data-device-key="${CSS.escape(targetKey)}"]`)
                : null;
            if (targetCard) {
                const btn = targetCard.querySelector(`.btn-${targetAction}`) || targetCard.querySelector("button");
                if (btn) {
                    btn.focus();
                }
            } else if (requestBtn) {
                requestBtn.focus();
            }
        }
    }

    /**
     * Disables or enables all interactive controls during asynchronous USB operations to prevent race conditions.
     * 
     * @param {boolean} inProgress - Whether an async operation is currently in flight.
     */
    function setOperationInProgress(inProgress) {
        isOperationInProgress = inProgress;
        if (requestBtn) {
            requestBtn.disabled = inProgress;
        }
        if (refreshBtn) {
            refreshBtn.disabled = inProgress;
        }
        if (deviceList) {
            const buttons = deviceList.querySelectorAll("button");
            buttons.forEach(btn => {
                btn.disabled = inProgress;
            });
            if (inProgress) {
                deviceList.setAttribute("aria-busy", "true");
            } else {
                deviceList.removeAttribute("aria-busy");
            }
        }
        if (!inProgress) {
            if (pendingFocus) {
                restoreFocus();
            }
            if (pendingRefresh) {
                pendingRefresh = false;
                updateDeviceList().catch(err => {
                    console.error("Failed to update device list on deferred refresh:", err);
                });
            }
        }
    }

    /**
     * Updates UI status banner.
     * 
     * @param {string} message - Feedback message to display.
     * @param {string} [type=StatusType.INFO] - Alert severity level.
     */
    function setStatus(message, type = StatusType.INFO) {
        if (!statusBox) {
            return;
        }

        if (type === StatusType.ERROR) {
            statusBox.setAttribute("role", "alert");
            statusBox.setAttribute("aria-live", "assertive");
        } else {
            statusBox.setAttribute("role", "status");
            statusBox.setAttribute("aria-live", "polite");
        }

        statusBox.className = `status-box ${type}`;
        statusBox.textContent = message;
    }

    /**
     * Handles device open errors with descriptive feedback.
     * 
     * @param {unknown} err - Captured exception.
     * @param {string} deviceName - Human-readable device name.
     */
    function handleOpenError(err, deviceName) {
        const errorName = (err && typeof err === "object" && "name" in err) ? String(err.name) : "";
        const errorMessage = getErrorMessage(err);

        if (errorName === "SecurityError") {
            setStatus(`Access denied to "${deviceName}".`, StatusType.ERROR);
        } else if (errorName === "InvalidStateError") {
            setStatus(`Device "${deviceName}" is busy or already open in another context.`, StatusType.ERROR);
        } else if (errorName === "NetworkError") {
            setStatus(`Failed to open device "${deviceName}": The device or its interface may already be claimed by the operating system kernel driver.`, StatusType.ERROR);
        } else if (errorName === "NotFoundError" || errorMessage.includes("The device was disconnected")) {
            setStatus(`Device "${deviceName}" was reset or disconnected by the system. Please physically reconnect the USB cable and click "Open".`, StatusType.ERROR);
        } else {
            setStatus(`Failed to open device "${deviceName}": ${errorMessage}`, StatusType.ERROR);
        }
    }

    /**
     * Builds and appends a device card element safely using DOM APIs.
     * 
     * @param {USBDevice} device - The WebUSB device instance.
     * @returns {HTMLElement} The constructed list item element.
     */
    function createDeviceCard(device) {
        const card = document.createElement("li");
        card.className = "device-card";

        const deviceKey = getDeviceKey(device);
        card.dataset.deviceKey = deviceKey;

        // Device info section
        const infoDiv = document.createElement("div");
        infoDiv.className = "device-info";
        
        const name = getDeviceName(device);
        const nameHeading = document.createElement("h3");
        nameHeading.className = "device-name";
        nameHeading.appendChild(document.createTextNode(name + " "));
        
        const isOpened = device.opened;
        const badge = document.createElement("span");
        badge.className = `badge ${isOpened ? "badge-success" : "badge-secondary"}`;
        badge.textContent = isOpened ? "Connected & Open" : "Paired (Closed)";
        nameHeading.appendChild(badge);

        const metaDiv = document.createElement("div");
        metaDiv.className = "device-meta";
        
        const manufacturer = device.manufacturerName || "Unknown Manufacturer";
        const vid = formatHex(device.vendorId);
        const pid = formatHex(device.productId);
        const serial = device.serialNumber || "N/A";
        const metaFields = [
            { label: "Manufacturer", value: manufacturer },
            { label: "VID", value: vid },
            { label: "PID", value: pid },
            { label: "Serial", value: serial },
        ];

        metaFields.forEach(({ label, value }) => {
            const row = document.createElement("div");
            row.className = "device-meta-row";

            const labelSpan = document.createElement("span");
            labelSpan.className = "device-meta-label";
            labelSpan.textContent = `${label}:`;

            const valueSpan = document.createElement("span");
            valueSpan.className = "device-meta-value";
            valueSpan.textContent = value;

            row.appendChild(labelSpan);
            row.appendChild(valueSpan);
            metaDiv.appendChild(row);
        });

        infoDiv.appendChild(nameHeading);
        infoDiv.appendChild(metaDiv);

        card.appendChild(infoDiv);

        // Action buttons container
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "device-actions";

        if (!isOpened) {
            const openBtn = document.createElement("button");
            openBtn.type = "button";
            openBtn.className = "btn-primary btn-sm btn-open";
            openBtn.setAttribute("aria-label", `Open connection to ${name}`);
            openBtn.textContent = "Open";
            openBtn.disabled = isOperationInProgress;

            openBtn.addEventListener("click", async () => {
                if (isOperationInProgress) {
                    return;
                }

                setOperationInProgress(true);
                openBtn.textContent = "Opening...";

                try {
                    await device.open();
                    pendingFocus = { deviceKey, action: "close" };
                    setStatus(`Successfully opened connection to "${name}".`, StatusType.SUCCESS);
                } catch (err) {
                    pendingFocus = { deviceKey, action: "open" };
                    handleOpenError(err, name);
                } finally {
                    openBtn.textContent = "Open";
                    await updateDeviceList();
                    setOperationInProgress(false);
                }
            });
            actionsDiv.appendChild(openBtn);
        } else {
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "btn-danger btn-sm btn-close";
            closeBtn.setAttribute("aria-label", `Close connection to ${name}`);
            closeBtn.textContent = "Close";
            closeBtn.disabled = isOperationInProgress;

            closeBtn.addEventListener("click", async () => {
                if (isOperationInProgress) {
                    return;
                }

                setOperationInProgress(true);
                closeBtn.textContent = "Closing...";

                try {
                    await device.close();
                    pendingFocus = { deviceKey, action: "open" };
                    setStatus(`Closed connection to "${name}".`, StatusType.INFO);
                } catch (err) {
                    pendingFocus = { deviceKey, action: "close" };
                    setStatus(`Failed to close device: ${getErrorMessage(err)}`, StatusType.ERROR);
                } finally {
                    closeBtn.textContent = "Close";
                    await updateDeviceList();
                    setOperationInProgress(false);
                }
            });
            actionsDiv.appendChild(closeBtn);
        }

        if (typeof device.forget === "function") {
            const forgetBtn = document.createElement("button");
            forgetBtn.type = "button";
            forgetBtn.className = "btn-secondary btn-sm btn-forget";
            forgetBtn.setAttribute("aria-label", `Forget device ${name}`);
            forgetBtn.textContent = "Forget";
            forgetBtn.disabled = isOperationInProgress;

            forgetBtn.addEventListener("click", async () => {
                if (isOperationInProgress) {
                    return;
                }

                setOperationInProgress(true);
                const successorKey = findSuccessorKey(card);
                forgetBtn.textContent = "Forgetting...";

                try {
                    if (device.opened) {
                        try {
                            await device.close();
                        } catch {
                            // Silently ignore close failure prior to forget
                        }
                    }
                    await device.forget();
                    pendingFocus = {
                        deviceKey: successorKey,
                        action: "forget",
                    };
                    setStatus(`Revoked permission for "${name}".`, StatusType.INFO);
                } catch (err) {
                    pendingFocus = { deviceKey, action: "forget" };
                    setStatus(`Failed to forget device: ${getErrorMessage(err)}`, StatusType.ERROR);
                } finally {
                    forgetBtn.textContent = "Forget";
                    await updateDeviceList();
                    setOperationInProgress(false);
                }
            });
            actionsDiv.appendChild(forgetBtn);
        }

        card.appendChild(actionsDiv);
        return card;
    }

    /**
     * Refreshes the authorized device list from the browser's permission store.
     * @returns {Promise<boolean>} True if refreshed successfully, false if stale or error.
     */
    async function updateDeviceList() {
        if (!deviceList) {
            return false;
        }
        
        const updateId = ++currentUpdateId;

        try {
            const devices = await navigator.usb.getDevices();
            if (updateId !== currentUpdateId) {
                return false; // Stale request, ignore
            }

            // Pre-assign deterministic keys to all enumerated devices
            const fingerprintCounts = new Map();
            devices.forEach(device => {
                const fingerprint = getDeviceFingerprint(device);
                const count = fingerprintCounts.get(fingerprint) || 0;
                fingerprintCounts.set(fingerprint, count + 1);
                getDeviceKey(device, count);
            });


            // Preserve focus if active element was inside the list prior to re-render
            const isFocusInsideList = Boolean(document.activeElement && deviceList.contains(document.activeElement));
            if (isFocusInsideList && !pendingFocus) {
                const activeCard = document.activeElement?.closest(".device-card");
                const activeKey = activeCard?.dataset.deviceKey || null;
                const successorKey = findSuccessorKey(activeCard);
                let buttonSelector = null;
                if (document.activeElement?.classList.contains("btn-open")) {
                    buttonSelector = ".btn-open";
                } else if (document.activeElement?.classList.contains("btn-close")) {
                    buttonSelector = ".btn-close";
                } else if (document.activeElement?.classList.contains("btn-forget")) {
                    buttonSelector = ".btn-forget";
                }

                pendingFocus = {
                    deviceKey: activeKey,
                    fallbackKey: successorKey,
                    buttonSelector,
                    action: "preserve",
                };
            }

            if (devices.length === 0) {
                const emptyItem = document.createElement("li");
                emptyItem.className = "empty-message";
                emptyItem.textContent = 'No connected paired devices found. Connect your device or click "Request New Device" to pair.';
                deviceList.replaceChildren(emptyItem);

                if (!isOperationInProgress && pendingFocus && requestBtn) {
                    requestBtn.focus();
                    pendingFocus = null;
                }

                return true;
            }

            const fragment = document.createDocumentFragment();
            devices.forEach(device => {
                fragment.appendChild(createDeviceCard(device));
            });
            deviceList.replaceChildren(fragment);

            if (!isOperationInProgress && pendingFocus) {
                restoreFocus();
            }

            return true;
        } catch (err) {
            if (updateId !== currentUpdateId) {
                return false;
            }
            
            console.error("Error refreshing device list:", err);
            setStatus(`Error refreshing device list: ${getErrorMessage(err)}`, StatusType.ERROR);

            return false;
        }
    }

    /**
     * Handles device discovery and authorization flow.
     */
    async function handleRequestDevice() {
        if (isOperationInProgress) {
            return;
        }

        setOperationInProgress(true);

        try {
            setStatus("Requesting device access...", StatusType.INFO);
            const device = await navigator.usb.requestDevice({ filters: [] });
            const deviceName = getDeviceName(device);
            pendingFocus = { deviceKey: getDeviceKey(device), action: "open" };
            setStatus(`Paired device: ${deviceName}. Click "Open" to connect.`, StatusType.SUCCESS);
        } catch (error) {
            if (error?.name === "NotFoundError") {
                setStatus("Device selection was cancelled.", StatusType.WARNING);
            } else {
                setStatus(`Failed to select device: ${getErrorMessage(error)}`, StatusType.ERROR);
            }
        } finally {
            await updateDeviceList();
            setOperationInProgress(false);
        }
    }

    /**
     * Disables the application and displays an error message when WebUSB prerequisites are not met.
     * 
     * @param {string} message - Error message.
     */
    function disableApp(message) {
        setStatus(message, StatusType.ERROR);
        if (requestBtn) {
            requestBtn.disabled = true;
        }
        if (refreshBtn) {
            refreshBtn.disabled = true;
        }
        if (deviceList) {
            deviceList.replaceChildren();
            const emptyItem = document.createElement("li");
            emptyItem.className = "empty-message";
            emptyItem.textContent = message;
            deviceList.appendChild(emptyItem);
        }
    }

    /**
     * Initializes the application and registers WebUSB lifecycle event listeners.
     */
    function init() {
        requestBtn = document.getElementById("requestBtn");
        refreshBtn = document.getElementById("refreshBtn");
        statusBox = document.getElementById("statusBox");
        deviceList = document.getElementById("deviceList");

        if (!window.isSecureContext) {
            disableApp("WebUSB is unavailable: this page is not running in a Secure Context.");
            return;
        }

        if (!("usb" in navigator)) {
            disableApp("WebUSB is not supported by your browser.");
            return;
        }

        if (requestBtn) {
            requestBtn.addEventListener("click", handleRequestDevice);
        }

        if (refreshBtn) {
            refreshBtn.addEventListener("click", async () => {
                if (isOperationInProgress) {
                    return;
                }

                setOperationInProgress(true);
                setStatus("Refreshing device list...", StatusType.INFO);

                try {
                    const success = await updateDeviceList();
                    if (success && !pendingRefresh) {
                        setStatus("Device list refreshed successfully.", StatusType.SUCCESS);
                    }
                } catch (err) {
                    setStatus(`Failed to refresh devices: ${getErrorMessage(err)}`, StatusType.ERROR);
                } finally {
                    setOperationInProgress(false);
                }
            });
        }

        // Real-time hardware attach/detach events
        navigator.usb.addEventListener("connect", async (event) => {
            const deviceName = getDeviceName(event.device);
            setStatus(`Hardware connected: ${deviceName}`, StatusType.INFO);
            if (!isOperationInProgress) {
                try {
                    await updateDeviceList();
                } catch (err) {
                    console.error("Failed to update device list on connect:", err);
                    setStatus(`Device connected, but refresh failed: ${getErrorMessage(err)}`, StatusType.ERROR);
                }
            } else {
                pendingRefresh = true;
            }
        });

        navigator.usb.addEventListener("disconnect", async (event) => {
            const deviceName = getDeviceName(event.device);
            setStatus(`Hardware disconnected: ${deviceName}`, StatusType.WARNING);
            if (!isOperationInProgress) {
                try {
                    await updateDeviceList();
                } catch (err) {
                    console.error("Failed to update device list on disconnect:", err);
                    setStatus(`Device disconnected, but refresh failed: ${getErrorMessage(err)}`, StatusType.ERROR);
                }
            } else {
                pendingRefresh = true;
            }
        });

        // Initial load of previously authorized devices
        updateDeviceList().catch(console.error);
    }

    // Bootstrap application on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
