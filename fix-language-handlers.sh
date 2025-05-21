#!/bin/bash

# Script to fix missing closing braces in language handler files

# List of language handler files to fix
files=(
  "src/tools/code-map-generator/languageHandlers/bash.ts"
  "src/tools/code-map-generator/languageHandlers/cpp.ts"
  "src/tools/code-map-generator/languageHandlers/csharp.ts"
  "src/tools/code-map-generator/languageHandlers/dart.ts"
  "src/tools/code-map-generator/languageHandlers/elixir.ts"
  "src/tools/code-map-generator/languageHandlers/go.ts"
  "src/tools/code-map-generator/languageHandlers/graphql.ts"
  "src/tools/code-map-generator/languageHandlers/html.ts"
  "src/tools/code-map-generator/languageHandlers/java.ts"
  "src/tools/code-map-generator/languageHandlers/json.ts"
  "src/tools/code-map-generator/languageHandlers/kotlin.ts"
  "src/tools/code-map-generator/languageHandlers/lua.ts"
  "src/tools/code-map-generator/languageHandlers/objectivec.ts"
  "src/tools/code-map-generator/languageHandlers/php.ts"
  "src/tools/code-map-generator/languageHandlers/r.ts"
  "src/tools/code-map-generator/languageHandlers/ruby.ts"
  "src/tools/code-map-generator/languageHandlers/rust.ts"
  "src/tools/code-map-generator/languageHandlers/scala.ts"
  "src/tools/code-map-generator/languageHandlers/swift.ts"
  "src/tools/code-map-generator/languageHandlers/toml.ts"
  "src/tools/code-map-generator/languageHandlers/typescript.ts"
  "src/tools/code-map-generator/languageHandlers/vue.ts"
  "src/tools/code-map-generator/languageHandlers/yaml.ts"
)

# Loop through each file and add the missing closing brace
for file in "${files[@]}"; do
  echo "Fixing $file..."
  
  # Add a closing brace at the end of the file
  echo "}" >> "$file"
  
  echo "Fixed $file"
done

echo "All language handler files have been fixed."
