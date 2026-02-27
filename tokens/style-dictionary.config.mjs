const config = {
  source: ['tokens/design-tokens.json'],
  log: {
    verbosity: 'verbose',
  },
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'src/styles/generated/',
      prefix: 'owny',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: {
            selector: ':root',
            outputReferences: true,
          },
        },
      ],
    },
    json: {
      transformGroup: 'js',
      buildPath: 'src/styles/generated/',
      prefix: 'owny',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested',
        },
      ],
    },
  },
};

export default config;
