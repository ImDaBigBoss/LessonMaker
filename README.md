# Lesson Maker

This project was created to convert lessons written in Markdown into an HTML page that can then easily be saved to a PDF. The layout will be very much like a LaTeX document, but with the comforts of Markdown.

**Note:** This project was created for conversion of French maths lessons, many features will be specific to that use case.

## Usage

Put all the files (in alphabetical order) that you want to include in your lesson into a folder. Each file should be prefixed with `alm_` followed by whatever you like (it won't be shown) and ending in `.md`. Then simply run:
```bash
npm i # Install dependencies
npm run build <folder_path> <lesson_title>
```

The output HTML page and its dependencies will be placed in the `dist` folder.

## Example

An example (in French) can be found in the `example` folder. The [output saved as a PDF](example/Exemple.pdf) (using Firefox) is in the same folder. To generate the example lesson, run:
```bash
npm run build example "Exemple de leçon"
```

## Licensing

The font in the `template` folder is from [Source Forge](https://sourceforge.net/projects/cm-unicode/), I do not own the rights to it.
