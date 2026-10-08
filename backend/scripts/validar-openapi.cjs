const SwaggerParser = require('@apidevtools/swagger-parser');
const path = require('node:path');

SwaggerParser.validate(path.resolve(__dirname, '../../api/openapi.yaml'))
  .then(() => console.log('OpenAPI válido'))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
