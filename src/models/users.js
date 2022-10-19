import { processResult, getFirstRowValue, readQuery } from '../setup';
import log4js from 'log4js';

const logger = log4js.getLogger('designrvt.models.users');

export const getCurrentUser = async (context) => {
  const id = context.userProfile.username;
    logger.info(`getCurrentUser: ${id}`)
    try {
        const query=`
      MATCH (user:User {username:$id})
      OPTIONAL MATCH (user)-[:HAS_ROLE]-(role)
      RETURN user{.*,roles:collect(role{.*})} as user
      `;
        const args={id};
        var result=await readQuery(query, args)
        result = processResult(result);
        return getFirstRowValue(result, "user", "Unable to fetch current user");
    } catch (error) {
        logger.error("getCurrentUser error\n");
        logger.error(error);
        return(error);
    }
}
