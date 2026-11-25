const domain = 'src/modules/agents/domain/';
const application = 'src/modules/agents/application/';
const sharedAgentTypes = 'src/vendor/shared/contracts/knowledge\\.ts$';
const innerLayers = `^(?:${domain}|${application})`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'agents-domain-imports-inward',
      severity: 'error',
      from: { path: `^${domain}` },
      to: { pathNot: `^(?:${domain}|${sharedAgentTypes})` },
    },
    {
      name: 'agents-application-imports-inward',
      severity: 'error',
      from: { path: `^${application}` },
      to: { pathNot: innerLayers },
    },
    {
      name: 'agents-inner-layers-no-unresolved-imports',
      severity: 'error',
      from: { path: innerLayers },
      to: { couldNotResolve: true },
    },
    {
      name: 'agents-inner-layers-no-cycles',
      severity: 'error',
      from: { path: innerLayers },
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: '(^|/)node_modules/' },
  },
};
