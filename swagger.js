const swaggerAutogen = require('swagger-autogen')()

const outputFile = './swagger_output.json'
const endpointsFiles = ['./src/routes/index.ts', './src/routes/api.ts']

swaggerAutogen(outputFile, endpointsFiles)