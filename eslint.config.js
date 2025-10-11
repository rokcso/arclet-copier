import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        Blob: "readonly",
        AbortController: "readonly",
        crypto: "readonly",
        URLSearchParams: "readonly",
        Event: "readonly",
        queueMicrotask: "readonly",
        getComputedStyle: "readonly",
        // Chrome extension globals
        chrome: "readonly",
        // Web API globals
        location: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        confirm: "readonly",
        // Web API globals
        URL: "readonly",
        ClipboardItem: "readonly",
        // Extension specific globals
        shortUrlCache: "readonly",
        QRCode: "readonly",
      },
    },
    rules: {
      // 基础规则，保持宽松
      "no-unused-vars": "warn",
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "warn",
      eqeqeq: "warn",
      curly: "warn",
      "no-trailing-spaces": "off",
      "comma-dangle": "off",
      semi: "off",
      quotes: "off",
      indent: "off",
      "no-prototype-builtins": "off",
      "no-case-declarations": "off",
      "no-redeclare": "off",
      "no-useless-escape": "off",
    },
  },
];
