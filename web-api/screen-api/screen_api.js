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
    document.getElementById("observation-button").style.display = "none"

    logScreenProperites()

    screen.addEventListener("change", (event) => {
        logScreenProperites()
    })
}

function logScreenProperites() {
    const screenPropertiesLog = document.createElement('div')
    screenPropertiesLog.classList.add('line')
    screenPropertiesLog.textContent = `${++logNumber}\t${new Date().toLocaleTimeString()}\tScreen state: ${JSON.stringify(getAllProperties(screen), null, 2)}`
    logContainer.appendChild(screenPropertiesLog)
    logContainer.scrollTop = logContainer.scrollHeight
}
