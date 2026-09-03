import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import { createAvatar } from "@bible-strong/avatar-react"

const argumentsAfterScript = process.argv.slice(2)
if (argumentsAfterScript[0] === "--") argumentsAfterScript.shift()

const [projectArgument, templateArgument, outputArgument] = argumentsAfterScript

if (!projectArgument) {
  console.error(
    "Usage: pnpm avatars:generate -- <studio-project.json> [behavior-template.avatar.json] [output-directory]"
  )
  process.exit(1)
}

const projectPath = path.resolve(projectArgument)
const templatePath = path.resolve(templateArgument ?? "app/docbot.avatar.json")
const outputDirectory = path.resolve(
  outputArgument ?? "lib/avatars/definitions"
)

const readJson = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    throw new Error(`Could not read JSON from ${filePath}`, { cause: error })
  }
}

const assertObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
}

const assertFiniteNumber = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`)
  }
  return value
}

const avatarEyeFields = {
  left: {
    width: "widthLeft",
    height: "heightLeft",
    x: "positionXLeft",
    y: "positionYLeft",
    angle: "leftAngle",
  },
  right: {
    width: "widthRight",
    height: "heightRight",
    x: "positionXRight",
    y: "positionYRight",
    angle: "rightAngle",
  },
}

const shiftValue = ({ value, sourceEyes, targetEyes, sourceField, label }) => {
  const shifted =
    assertFiniteNumber(value, label) +
    assertFiniteNumber(targetEyes[sourceField], `target eyes.${sourceField}`) -
    assertFiniteNumber(sourceEyes[sourceField], `source eyes.${sourceField}`)

  return sourceField.startsWith("width") || sourceField.startsWith("height")
    ? Math.max(10, shifted)
    : shifted
}

const adaptExpressionToAvatar = (
  expression,
  sourceEyes,
  targetEyes,
  expressionKey
) => {
  assertObject(expression, `expression '${expressionKey}'`)
  assertObject(expression.eyes, `expression '${expressionKey}'.eyes`)

  const adapted = structuredClone(expression)

  for (const side of ["left", "right"]) {
    assertObject(
      expression.eyes[side],
      `expression '${expressionKey}'.eyes.${side}`
    )

    for (const [definitionField, sourceField] of Object.entries(
      avatarEyeFields[side]
    )) {
      adapted.eyes[side][definitionField] = shiftValue({
        value: expression.eyes[side][definitionField],
        sourceEyes,
        targetEyes,
        sourceField,
        label: `expression '${expressionKey}'.eyes.${side}.${definitionField}`,
      })
    }
  }

  adapted.eyes.spacing = shiftValue({
    value: expression.eyes.spacing,
    sourceEyes,
    targetEyes,
    sourceField: "spacing",
    label: `expression '${expressionKey}'.eyes.spacing`,
  })

  return adapted
}

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "avatar"

const optionalSurfaceFields = [
  "morphRoundness",
  "tipRoundness",
  "baseRoundness",
]

const mapSurface = (surface, label) => {
  assertObject(surface, label)

  const mapped = {
    type: surface.type,
    width: assertFiniteNumber(surface.width, `${label}.width`),
    height: assertFiniteNumber(surface.height, `${label}.height`),
    depth: assertFiniteNumber(surface.depth, `${label}.depth`),
    roundness: assertFiniteNumber(surface.roundness, `${label}.roundness`),
  }

  for (const field of optionalSurfaceFields) {
    if (surface[field] !== undefined) {
      mapped[field] = assertFiniteNumber(surface[field], `${label}.${field}`)
    }
  }

  return mapped
}

const mapBody = (body, avatarName) => {
  assertObject(body, `avatar '${avatarName}'.body`)
  if (!Array.isArray(body.nodes)) {
    throw new TypeError(`avatar '${avatarName}'.body.nodes must be an array`)
  }

  return {
    primary: mapSurface(body.primary, `avatar '${avatarName}'.body.primary`),
    nodes: body.nodes.map((node, index) => {
      assertObject(node, `avatar '${avatarName}'.body.nodes[${index}]`)
      if (!Array.isArray(node.position) || !Array.isArray(node.rotation)) {
        throw new TypeError(
          `avatar '${avatarName}'.body.nodes[${index}] must have position and rotation arrays`
        )
      }

      return {
        surface: mapSurface(
          node.surface,
          `avatar '${avatarName}'.body.nodes[${index}].surface`
        ),
        position: [...node.position],
        rotation: [...node.rotation],
      }
    }),
  }
}

const project = await readJson(projectPath)
const behaviorTemplate = await readJson(templatePath)

assertObject(project, "Studio project")
assertObject(project.library, "Studio project library")
assertObject(behaviorTemplate, "Behavior template")

if (
  !Array.isArray(project.library.avatars) ||
  !project.library.avatars.length
) {
  throw new TypeError("Studio project library must contain at least one avatar")
}

if (behaviorTemplate.schema !== "bible-strong/avatar-definition") {
  throw new TypeError(
    "Behavior template must be a Bible Strong avatar definition"
  )
}

const sourceAvatar = project.library.avatars.find(
  (avatar) => avatar.name === behaviorTemplate.name
)

if (!sourceAvatar) {
  throw new Error(
    `Could not find behavior template avatar '${behaviorTemplate.name}' in the Studio project`
  )
}

assertObject(sourceAvatar.eyes, `source avatar '${sourceAvatar.name}'.eyes`)
assertObject(behaviorTemplate.expressions, "Behavior template expressions")
assertObject(behaviorTemplate.animations, "Behavior template animations")

await mkdir(outputDirectory, { recursive: true })

const manifestAvatars = []
const filenames = new Set()

for (const avatar of project.library.avatars) {
  assertObject(avatar, "Studio avatar")
  assertObject(avatar.body, `avatar '${avatar.name}'.body`)
  assertObject(avatar.colors, `avatar '${avatar.name}'.colors`)
  assertObject(avatar.eyes, `avatar '${avatar.name}'.eyes`)

  const filename = `${slugify(avatar.name)}.avatar.json`
  if (filenames.has(filename)) {
    throw new Error(`Duplicate generated filename '${filename}'`)
  }
  filenames.add(filename)

  const definition = structuredClone(behaviorTemplate)
  definition.name = avatar.name
  definition.body = mapBody(avatar.body, avatar.name)
  definition.colors = structuredClone(avatar.colors)
  definition.expressions = Object.fromEntries(
    Object.entries(behaviorTemplate.expressions).map(([key, expression]) => [
      key,
      adaptExpressionToAvatar(expression, sourceAvatar.eyes, avatar.eyes, key),
    ])
  )

  // createAvatar validates the complete definition, including semantic keys,
  // animation references, ordering, colors, geometry, and playback settings.
  createAvatar(definition)

  await writeFile(
    path.join(outputDirectory, filename),
    `${JSON.stringify(definition, null, 2)}\n`
  )

  manifestAvatars.push({ id: avatar.id, name: avatar.name, file: filename })
}

const manifest = {
  schema: "docbot/avatar-definition-manifest",
  schemaVersion: 1,
  behaviorTemplate: behaviorTemplate.name,
  expressionKeys: behaviorTemplate.expressionOrder,
  animationKeys: behaviorTemplate.animationOrder,
  avatars: manifestAvatars,
}

await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
)

console.log(
  `Generated ${manifestAvatars.length} validated avatar definitions in ${outputDirectory}`
)
