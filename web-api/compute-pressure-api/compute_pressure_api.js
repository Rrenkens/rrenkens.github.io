let observer = null;

function writeMessage(message) {
    const outputArea = document.getElementById("output-area");
    outputArea.textContent += `${new Date().toLocaleString()}: ${message}\n`;
    outputArea.scrollTop = outputArea.scrollHeight;
}

function setButtonsState(isStartComputePressureCpuObserverButtonDisabled, isStopComputePressureCpuObserverButtonDisabled) {
    const startComputePressureCpuObserverButton = document.getElementById("start-compute-pressure-cpu-observer-button");
    const stopComputePressureCpuObserverButton = document.getElementById("stop-compute-pressure-cpu-observer-button");

    startComputePressureCpuObserverButton.disabled = isStartComputePressureCpuObserverButtonDisabled;
    stopComputePressureCpuObserverButton.disabled = isStopComputePressureCpuObserverButtonDisabled;
}

function computePressureCallback(records) {
    const lastRecord = records[records.length - 1];
    writeMessage(`Pressure change: source=${lastRecord.source}, state=${lastRecord.state}, time=${lastRecord.time}.`);
}

async function startComputePressureCpuObserver() {
    setButtonsState(true, false);

    observer = new PressureObserver(computePressureCallback);

    writeMessage("Compute Pressure CPU Observer is active.");

    observer.observe("cpu");
}

function stopComputePressureCpuObserver() {
    setButtonsState(false, true);
    observer.unobserve("cpu");
    writeMessage("Compute Pressure CPU Observer is stopped.");
}
