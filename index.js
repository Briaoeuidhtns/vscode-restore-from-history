import fs from 'fs/promises'
import path from 'path'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = await yargs(hideBin(process.argv))
  .command(
    'restore <path>',
    'restore a directory to latest version',
    (yargs) => {
      yargs.positional('path', {
        describe:
          'path to restore, must be relative to root or share a common prefix with root',
        type: 'string',
      })
    },
  )
  .command('list <path>', 'list files in a directory', (yargs) => {
    yargs.positional('path', {
      describe:
        'path to list, must be relative to root or share a common prefix with root',
      type: 'string',
    })
  })
  .option('history', {
    alias: 'h',
    type: 'string',
    description: 'path to history directory',
  })
  .option('root', {
    alias: 'i',
    type: 'string',
    description: 'Root path to remove from path',
  })
  .option('destination', {
    alias: 'o',
    type: 'string',
    description: 'Path to restore to',
  })
  .demandCommand()
  .demandOption(['root'])
  .help()
  .alias('help', 'h').argv

const {
  _: [command],
  root,
  path: pathToRestore,
} = argv

const history = argv.history || path.join(...(process.platform === 'win32' ? [process.env.APPDATA] : [process.env.HOME, '.config']), 'Code', 'User', 'History')
const destination = argv.destination || process.cwd()


const rootPath = path.resolve(root)
const historyPath = path.resolve(history)
const destinationPath = path.resolve(destination)

await fs.access(historyPath)
await fs.access(destinationPath)

// process all the entries.json files in the history directory
const historyEntries = await fs.readdir(historyPath)
const historyEntriesResults = (await Promise.all(
  historyEntries.map(async (entry) => {
    try {
      const entriesPath = path.join(historyPath, entry, 'entries.json')
      const entries = await fs.readFile(entriesPath, 'utf-8')
      return {
        ...JSON.parse(entries),
        path: path.join(historyPath, entry),
      }
    } catch (e) {
      // console.error(e)
      return null
    }
  }),
)).filter(Boolean)

const realRootPath = 'file:///' + (rootPath + '/' + pathToRestore).replace(/\\/g, '/').replace(/^\//g, '').replace(/:/g, '%3A').replace('//', '/').toLowerCase()
console.log(rootPath)
// console.log(historyEntriesResults.map((entry) => entry.resource))
// get the list of files that match the path
const matchingEntries = historyEntriesResults.filter((entry) =>
  entry.resource.toLowerCase().startsWith(realRootPath),
)

// get the latest version of each file
const latestEntries = matchingEntries.map((entry) => {
  entry.entries.sort((a, b) => b.timestamp - a.timestamp)
  return {
    resource: entry.resource,
    path: path.join(entry.path, entry.entries[0].id),
  }
})

const relativeEntries = latestEntries.map((entry) => {
  return {
    source: entry.path,
    destination: path.join(
      destinationPath,
      pathToRestore,
      entry.resource.toLowerCase().replace(realRootPath, '').replace(/%3A/g, ':')
    ),
  }
})

if (command === 'list') {
  relativeEntries.forEach((entry) => {
    console.log(entry.source + ' -> ' + entry.destination)
  })
} else if (command === 'restore') {
  await Promise.all(
    relativeEntries.map(async (entry) => {
      await fs.mkdir(path.dirname(entry.destination), { recursive: true })
      await fs.copyFile(entry.source, entry.destination)
      console.log(entry.source + ' -> ' + entry.destination)
    }),
  )
}
