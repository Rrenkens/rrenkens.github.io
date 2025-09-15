const logContainer = document.getElementById('logContainer')
let logNumber = 0
let screenDetails = null
let screenDetailsMap = null

function getAllProperties(object) {
    const properties = {}
    for (const property in object) {
        switch (typeof object[property]) {
            case "function":
                break
            case "object":
                Object.assign(properties, getAllProperties(object[property]))
                break
            default:
                properties[property] = object[property]
        }
    }

    return properties
}

function getAllPropertiesString(object) {
    return JSON.stringify(getAllProperties(object), null, 2)
}

async function startObservation() {
    screenDetails = await window.getScreenDetails()
    screenDetailsMap = getScreenDetailsMap(screenDetails)

    document.getElementById("observation-button").style.display = "none"

    let displayInitialStateMessage = `${++logNumber}\t${new Date().toLocaleTimeString()}\tDisplays initial state:`
    for (const [label, screenDetail] of screenDetailsMap.entries()) {
        displayInitialStateMessage += `\n${label}: ` + getAllPropertiesString(screenDetail)
        screenDetail.addEventListener("change", (event) => {
            logScreenPropertiesChanges(screenDetail)
        })
    }
    logMessage(displayInitialStateMessage)

    screenDetails.addEventListener("screenschange", (event) => {
        logScreenDetailsChanges()
    })
}

function logScreenPropertiesChanges(screenDetail) {
    logMessage(`${++logNumber}\t${new Date().toLocaleTimeString()}\tDisplay ${screenDetail.label} was changed:\n` + getAllPropertiesString(screenDetail))
}

function logScreenDetailsChanges() {
    let message = `${++logNumber}\t${new Date().toLocaleTimeString()}\tDisplays were changed:`

    const newScreenDetailsMap = getScreenDetailsMap(screenDetails)

    for (const [label, newScreenDetail] of newScreenDetailsMap) {
        if (screenDetailsMap.has(label)) {
            const screenDetail = screenDetailsMap.get(label)
            if (screenDetail != newScreenDetail) {
                message += `\nDisplay ${label} was changed: ` + getAllPropertiesString(newScreenDetail)
            }

            screenDetailsMap.delete(label)
        } else {
            message += `\nDisplay ${label} was added: ` + getAllPropertiesString(newScreenDetail)
            newScreenDetail.addEventListener("change", (event) => {
                logScreenPropertiesChanges(newScreenDetail)
            })
        }
    }

    for (const [label, screenDetail] of screenDetailsMap) {
        message += `\nDisplay ${label} was removed: ` + getAllPropertiesString(screenDetail)
    }

    screenDetailsMap = newScreenDetailsMap

    logMessage(message)
}

function getScreenDetailsMap(screenDetails) {
    const screenDetailsMap = new Map()

    for (const screenDetail of screenDetails.screens) {
        screenDetailsMap.set(screenDetail.label, screenDetail)
    }

    return screenDetailsMap
}

function logMessage(message) {
    const screenPropertiesLog = document.createElement('div')
    screenPropertiesLog.classList.add('line')
    screenPropertiesLog.textContent = message
    logContainer.appendChild(screenPropertiesLog)
    logContainer.scrollTop = logContainer.scrollHeight
}