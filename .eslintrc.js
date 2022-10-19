module.exports = {
    "env": {
        "browser": false,
        "node": true,
        "es6": true
    },
    "extends": [
        "eslint:recommended"
    ],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parserOptions": {
        "ecmaFeatures": {
            "modules": true
        },
        "ecmaVersion": 2017,
        "sourceType": "module"
    },
    "plugins": ["mocha"],
    "rules": {
        "no-unused-vars": [1, {"varsIgnorePattern": "^_"}],
        "no-extra-semi": "warn"
    }
}
