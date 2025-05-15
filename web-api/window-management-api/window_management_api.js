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

async function startObservation() {
    screenDetails = await window.getScreenDetails()
    screenDetailsMap = getScreenDetailsMap(screenDetails)

    document.getElementById("observation-button").style.display = "none"

    logMessage(`${++logNumber}\t${new Date().toLocaleTimeString()}\tScreen initial state:\n${JSON.stringify(getAllProperties(screen))}`)

    let displayInitialStateMessage = `${++logNumber}\t${new Date().toLocaleTimeString()}\tDisplays initial state:`
    for (const [label, screenDetail] of screenDetailsMap.entries()) {
        displayInitialStateMessage += `\n${label}: ${JSON.stringify(getAllProperties(screenDetail), null, 2)}`
    }
    logMessage(displayInitialStateMessage)

    screen.addEventListener("change", (event) => {
        logScreenPropertiesChanges()
        console.log("change event: ", event)
    })
    screenDetails.addEventListener("screenschange", (event) => {
        logScreenDetailsChanges()
        console.log("screenschange event: ", event)
    })
}

function logScreenPropertiesChanges() {
    logMessage(`${++logNumber}\t${new Date().toLocaleTimeString()}\tScreen was changed:\n${JSON.stringify(getAllProperties(screen))}`)
}

function logScreenDetailsChanges() {
    let message = `${++logNumber}\t${new Date().toLocaleTimeString()}\tDisplays were changed:`

    const newScreenDetailsMap = getScreenDetailsMap(screenDetails)

    for (const [label, newScreenDetail] of newScreenDetailsMap) {
        if (screenDetailsMap.has(label)) {
            const screenDetail = screenDetailsMap.get(label)
            if (screenDetail != newScreenDetail) {
                message += `\n${label} was changed: ${JSON.stringify(getAllProperties(newScreenDetail), null, 2)}`
            }

            screenDetailsMap.delete(label)
        } else {
            message += `\nDisplay ${label} was added: ${JSON.stringify(getAllProperties(newScreenDetail), null, 2)}`
        }
    }

    for (const [label, screenDetail] of screenDetailsMap) {
        message += `\nDisplay ${label} was removed: ${JSON.stringify(getAllProperties(screenDetail), null, 2)}`
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
    console.log("Height: ", logContainer.scrollHeight, logContainer.scrollTop)
    logContainer.scrollTop = logContainer.scrollHeight
}