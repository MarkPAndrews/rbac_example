import {
    getCurrentUser
} from "../models/users";

export default {
    Query: {
        getCurrentUser: async (root, args, context) => {
            return await getCurrentUser(context);
        },
    },
};
