// author @Author
import chalk from 'chalk';
import { DateTime } from 'luxon';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const version = require('../../package.json').version;

async function logger() {
  console.clear();

  console.log(chalk.gray("═══════════════════════════════════════════════════════════════════"));
  console.log("» " + chalk.blueBright("Author  : ") + chalk.white("Author"));
  console.log("» " + chalk.blueBright("Zalo    : ") + chalk.underline("0334371905"));
  console.log("» " + chalk.blueBright("Version : ") + chalk.underline(version));
  console.log(chalk.gray("═══════════════════════════════════════════════════════════════════\n"));
}

function getTimestamp() {
  const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
  return `[${now.toFormat("HH:mm:ss")}]`;
}

function log(data, option) {
  const time = getTimestamp();

  switch (option) {
    case "warn":
      console.log(
     chalk.hex("#ffffffff").bold(`${time} » `) +     
        chalk.hex("#ff0000ff").bold(`${data}`)                     
      );
      break;

    case "error":
      console.log(
       chalk.hex("#fafffcff").bold(`${time} » `) +      
        chalk.hex("#f90000ff").bold(`${data}`)                    
      );
      break;

    case "info":
      console.log(
        chalk.hex("#ffffffff").bold(`${time} » `) +   
        chalk.hex("#ff0000ff").bold(`${data}`)                  
      );
      break;
    case "auto":
      console.log(
       chalk.hex("#ffffffff").bold(`${time} » `) +    
        chalk.hex("#00ff1aff").bold(`${data}`)               
      );
      break;
        case "url":
      console.log(
       chalk.hex("#ffffffff").bold(`${time} » `) +    
        chalk.hex("#a8dbffff").bold(`${data}`)               
      );
      break;
         case "new":
      console.log(
       chalk.hex("#ffffffff").bold(`${time} » `) +    
        chalk.hex("#f2ff00ff").bold(`${data}`)               
      );
      break;
    default:
      console.log(
       chalk.hex("#ffffffff").bold(`${time} » `) +     
        chalk.hex("#ffffffff").bold(`${data}`)                           
      );
  }
}

export {
  log,
  logger
};

