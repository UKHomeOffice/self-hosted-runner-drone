jest.setTimeout(500000)
var actual = jest.requireActual('hooklib');
jest.mock('hooklib', () => ({ ...actual, getFileContents: () => 'echo hello drone'}))
