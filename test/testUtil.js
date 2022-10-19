const {readFileSync} = require('fs');
const log4js = require('log4js');
const logger = log4js.getLogger('designrvt.test.testUtil');

export const sendGqlAllOutput = async (server, query, params, user) => {
    const arg = {query: query, variables: params};
    if (!user) user = '';
    const buf = Buffer.from(`{"sub":"${user}"}`,'binary');
    const token = buf.toString('base64')
    const headers = {};
    headers['Authorization']=`Bearer TestHeader.${token}.TestSignature`;
    try{
        const result = await server.executeOperation(arg, {req: {headers, body:arg}});
        if(result.errors) logger.error(`Error from GraphQL: ${result.errors[0].message}`);
        return result;
    } catch(err){
        return err
    }
}

export const sendGql = async (server, query, params, user) => {
    return (await sendGqlAllOutput(server, query, params, user)).data;
}

export const loadTestData = async (filename, driver) => {
    const cypherCmds = [];
    let cmd = '';
    logger.info(`Ingesting test data ${filename}`);
    for (let l of readFileSync(filename, {encoding: 'utf-8'}).split('\n')) {
        l = l.trim();
        if (!l.length) continue;
        if (l.startsWith('//')) continue;
        cmd += ' ' + l;
        if (l.endsWith(';')) {
            cypherCmds.push(cmd);
            cmd = '';
        }
    }

    const session = driver.session();
    let result;
    for (let cmd of cypherCmds) {
        logger.debug('qry=' + cmd);
        result = await session.writeTransaction(tx => tx.run(cmd));
        logger.debug('stats:');
        logger.debug(result.summary.counters.updates());
    }
}

/**
 * Convenience function to return a comparison function for Array.sort(compareFn) to compare by a property
 * within an array item if the array is a list of objects
 * @param {*} prop 
 * @returns 
 */
export const compareByProp = (prop) => {
    return (a, b) => {
        if (a[prop] === b[prop]) return 0;
        return a[prop] > b[prop] ? 1 : -1;
    }
}