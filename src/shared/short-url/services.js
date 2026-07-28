// Short URL service configurations
// Each service supports these optional fields:
//   params(url)  → query parameters appended to the endpoint URL (GET-style)
//   body(url)    → raw body string for POST requests (e.g. JSON)
//   headers()    → extra headers merged into the fetch call
//   parse(text)  → custom response parser (default: return trimmed text)

export const SHORT_URL_SERVICES = {
  isgd: {
    name: "is.gd",
    endpoint: "https://is.gd/create.php",
    method: "GET",
    params: (url) => ({ format: "simple", url: url }),
  },
  tinyurl: {
    name: "TinyURL",
    endpoint: "https://tinyurl.com/api-create.php",
    method: "GET",
    params: (url) => ({ url: url }),
  },
  dagd: {
    name: "da.gd",
    endpoint: "https://da.gd/s",
    method: "GET",
    params: (url) => ({ url: url }),
  },
  cleanuri: {
    name: "CleanURI",
    endpoint: "https://cleanuri.com/api/v1/shorten",
    method: "POST",
    body: (url) => JSON.stringify({ url }),
    headers: () => ({ "Content-Type": "application/json" }),
    parse: (text) => {
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("CleanURI returned an invalid JSON response");
      }
      if (json && json.result_url) {
        return json.result_url;
      }
      throw new Error("CleanURI returned an unexpected JSON response");
    },
  },
};

/**
 * Create short URL (no throttling, for custom throttling scenarios)
 * @param {string} longUrl - Long URL to shorten
 * @param {string} service - Service name
 * @returns {Promise<string>} Short URL
 */
export async function createShortUrlDirect(longUrl, service = "isgd") {
  const serviceConfig = SHORT_URL_SERVICES[service];
  if (!serviceConfig) {
    throw new Error(`Unknown short URL service: ${service}`);
  }

  try {
    // Build the request URL (with query params for GET-style services)
    const url = new URL(serviceConfig.endpoint);
    if (serviceConfig.params) {
      const params = serviceConfig.params(longUrl);
      Object.keys(params).forEach((key) => {
        url.searchParams.append(key, params[key]);
      });
    }

    // Build fetch options with optional body and custom headers
    const fetchOptions = {
      method: serviceConfig.method,
      headers: {
        "User-Agent": "Arclet Copier Chrome Extension",
        ...(serviceConfig.headers ? serviceConfig.headers() : {}),
      },
    };
    if (serviceConfig.body) {
      fetchOptions.body = serviceConfig.body(longUrl);
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const responseText = await response.text();

    // Use custom parser if available, otherwise validate raw text
    let shortUrl;
    if (serviceConfig.parse) {
      shortUrl = serviceConfig.parse(responseText);
    } else {
      shortUrl = responseText.trim();
    }

    // Validate returned URL
    if (
      !shortUrl ||
      shortUrl.includes("Error") ||
      !shortUrl.startsWith("http")
    ) {
      throw new Error(`Invalid short URL returned: ${shortUrl}`);
    }

    return shortUrl.trim();
  } catch (error) {
    console.debug(`Short URL creation failed for ${service}:`, error);
    throw error;
  }
}
