import eslint from '@eslint/js'

export default [
  {
    ignores: ['dist/**', 'src-tauri/target/**'],
  },
  eslint.configs.recommended,
]
