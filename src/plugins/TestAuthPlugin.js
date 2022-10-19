export class TestAuthPlugin {
    constructor(input) {
        //nothing needed here
    }
    async decode(token) {
        //For Testing we'll assume that the token is simply a base64 encoded jwt
        var base64Url = token.split('.')[1];
        if(typeof base64Url === 'undefined'){
          console.log(`BAD Token {${token}}`);
        }
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(Buffer.from(base64, 'base64').toString().split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }
}

