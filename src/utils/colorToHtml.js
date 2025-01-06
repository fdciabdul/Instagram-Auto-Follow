const htmlColors = require('html-colors');
 

const colorToHtml = (color,message) => {
    const colorName = htmlColors.random;
    return colorName ? `<span style="color: ${colorName}">${message}</span>` : color;
};
module.exports = colorToHtml