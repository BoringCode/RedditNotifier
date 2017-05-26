/*
 * Helper utilities for RedditNotifier
 */

/*
 * Sum properties in an object
 */
var sum = function(obj, prop) {
    var total = 0, key;
    for (key in obj) {
        total += obj[key][prop];
    }
    return total;
}

/*
 * Returns a promise that resolves to the response from a remote URL
 * Currently only really supports the GET method
 */
var Request = function(method, url) { 
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		var requested = Date.now();
		xhr.open(method, url);
		xhr.onload = function() {
			if (this.status >= 200 && this.status < 300) {
				var response;
				// Attempt to decode as JSON
				try {
					response = JSON.parse(xhr.response);
				} catch(e) {
					response = xhr.response;
				}
				resolve({
					url: url,
					response: response,
					requested: requested
				});
			} else {
				reject({
					url: url,
					status: this.status,
					statusText: xhr.statusText,
					requested: requested
				});
			}
		};
		xhr.onerror = function() {
			reject({
				url: url,
				status: this.status,
				statusText: xhr.statusText,
				requested: requested
			});
		};
		xhr.send();
	});
}

var log = function(message, type = "log") {
	if (!config.debug) return false;
	switch(type) {
		default:
			console.log(config.name + ":", message);
	}
	return true;
};

var sound = (function() {
	var audio = document.createElement("audio");
	audio.setAttribute("preload", "auto");
	audio.setAttribute("autobuffer", "true");

	return {
		play: function() {
			var path = browser.extension.getURL("data/alert/" + config.alert);
			audio.src = path;
			audio.volume = config.volume / 100;
			audio.play();
		},
		stop: function() {
			audio.pause();
			audio.currentTime = 0;
		}
	}
})();

/*
 * A message thing
 */
var Message = function(data) {
	var self = this, key;

	// Define getters and setters for message data
	var keys = Object.keys(data);
	keys.forEach(function(key) {
		Object.defineProperty(self, key, {
			get: function() {
				return data[key]
			},
			set: function(value) {
				data[key] = value;
			}
		});
	});

	// Called whenever this object is converted to a string
	self.toString = function() {
		return ("message" in data) ? data["message"].toString() : "";
	}
}

/*
 * Fancy object to handle some of the absurdities of notifications
 */
var Notify = function(name, timeout) {
	var self = this;
	self.name = (name) ? name + " - " : "";
	self.timeout = (timeout) ? timeout : config.notifyTimeout;
	self.notifications = {};

	var create = function(icon, title, message, callback, time = self.timeout) {
		browser.notifications.create(null, {
			"type": "basic",
			"iconUrl": browser.extension.getURL(icon),
			"title":  self.name + title,
			"message": message
		}).then(function(id) {
			// Play alert sound
			sound.play();
			// Add callback for when the notification is clicked
			self.notifications[id] = callback;
			// Clear notification after a set amount of time
			if (time === false) return;
			setTimeout(function() {
				browser.notifications.clear(id, function() {});
				delete self.notifications[id];
			}, time * 1000);
		});
	}

	// Stub, I don't need this right now
	var update = function() {}

	browser.notifications.onClicked.addListener(function(id) {
		log("Clicked notification: " + id);
		if (!(id in self.notifications && typeof(self.notifications[id]) === "function")) return false;
		// Call callback for click
		self.notifications[id](id);
		delete self.notifications[id];
	});

	return {
		create: create,
		update: update
	};
}