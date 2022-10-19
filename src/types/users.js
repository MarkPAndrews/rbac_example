module.exports = `
  type User {
    username: String!
    name: String
    roles: [Role!]! @relationship(type: "HAS_ROLE", direction: OUT)
  }
  
  type Role {
    name: String!
  }

  type Query {
    getCurrentUser: User!
  }
`;