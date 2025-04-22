function getAllProperties(object) {
    const properties = {};
    for (const property in object) {
        switch (typeof object[property]) {
            case "function":
                break;
            case "object":
                Object.assign(properties, getAllProperties(object[property]))
                break;
            default:
                properties[property] = object[property];
        }
    }

    return properties;
}

async function getPublicScreenInfo() {
    try {
        cleanError();

        const header = document.getElementById("public-screen-info-header");
        const publicScreenInfo = document.getElementById("public-screen-info");

        publicScreenInfo.textContent = JSON.stringify(getAllProperties(screen));

        publicScreenInfo.style.display = "block";
        header.style.display = "block";
    } catch (err) {
        setError("Get public screen info", err);
    }
}

async function getAllScreensInfo() {
    try {
        cleanError();

        const allScreens = await window.getScreenDetails();

        const header = document.getElementById("all-screens-info-header");
        const screensList = document.getElementById("screens-list");

        while (screensList.firstChild) {
            screensList.removeChild(screensList.firstChild);
        }

        for (const screen of allScreens.screens) {
            const listItem = document.createElement("li");
            listItem.appendChild(document.createTextNode(JSON.stringify(getAllProperties(screen))));
            screensList.appendChild(listItem);
        }

        header.style.display = "block";
        screensList.style.display = "block";
    } catch (err) {
        setError("Get all screens info", err);
    }
}

function cleanError() {
    const error = document.getElementById("error");
    error.textContent = "";
    error.style.display = "none";
}

function setError(text, err) {
    const error = document.getElementById("error");
    error.textContent = `${text}: ${err}`;
    error.style.display = "block";
}
