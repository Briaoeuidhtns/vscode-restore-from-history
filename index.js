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
    // default: path.join(process.env.HOME, '.config', "Code", "User", "History"),
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
    // default: process.cwd(),
    description: 'Path to restore to',
  })
  .demandCommand()
  .demandOption(['root'])
  .help()
  .alias('help', 'h').argv

const {
  _: [command],
  root,
  history = path.join(process.env.HOME, '.config', 'Code', 'User', 'History'),
  destination = process.cwd(),
} = argv

const rootPath = path.resolve(root)
const historyPath = path.resolve(history)
const destinationPath = path.resolve(destination)

await fs.access(historyPath)
await fs.access(destinationPath)

// process all the entries.json files in the history directory
const historyEntries = await fs.readdir(historyPath)
const historyEntriesResults = await Promise.all(
  historyEntries.map(async (entry) => {
    const entriesPath = path.join(historyPath, entry, 'entries.json')
    const entries = await fs.readFile(entriesPath, 'utf-8')
    return {
      ...JSON.parse(entries),
      path: path.join(historyPath, entry),
    }
  }),
)

// get the list of files that match the path
const matchingEntries = historyEntriesResults.filter((entry) =>
  entry.resource.startsWith('file://' + rootPath),
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
      entry.resource.replace('file://' + rootPath, ''),
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
    }),
  )
}
