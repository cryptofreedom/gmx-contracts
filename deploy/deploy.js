const { errors } = require("../test/core/Vault/helpers");
module.exports = async ({
    getNamedAccounts,
    deployments,
    getChainId,
    getUnnamedAccounts, }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const gmx = await deployContract(deploy, deployer, "GMX", []);
    const nativeTokenSupply = expandDecimals(10 * 1000, 18)
    const nativeToken = { address: "" };
    //nativeToken.address = (await deploy('FaucetToken', { from: deployer, args: ["WTEH", "WTEH", 18, expandDecimals(1000, 18)] })).address
    nativeToken.address = (await deployContract(deploy, deployer, "FaucetToken", ["WTEH", "WTEH", 18, expandDecimals(1000, 18)])).address;
    const gmtSupply = expandDecimals(401 * 1000, 18)
    const gmt = await deployContract(deploy, deployer, "GMT", [gmtSupply]);
    const reader = await deployContract(deploy, deployer, "Reader", []);
    //deploy tokens
    const btc = await deployContract(deploy, deployer, "FaucetToken", ["Bitcoin", "BTC", 18, expandDecimals(1000, 18)])
    const weth = await deployContract(deploy, deployer, "FaucetToken", ["Wrapped ETH", "WETH", 18, expandDecimals(1000, 18)])
    const usdc = await deployContract(deploy, deployer, "FaucetToken", ["USDC Coin", "USDC", 18, expandDecimals(1000, 18)])
    const usdt = await deployContract(deploy, deployer, "FaucetToken", ["Tether", "USDT", 18, expandDecimals(1000, 18)])
    //const vault = await deploy("Vault", { from: deployer });
    const vault = await deployContract(deploy, deployer, "Vault", []);
    //const usdg = await deploy("USDG", { from: deployer, args: [vault.address] });
    const usdg = await deployContract(deploy, deployer, "USDG", [vault.address]);
    const router = await deployContract(deploy, deployer, "Router", [vault.address, usdg.address, nativeToken.address]);
    const vaultPriceFeed = await deployContract(deploy, deployer, "VaultPriceFeed", []);
    const orderBook = await deployContract(deploy, deployer, "OrderBook", []);
    //TODO: add orderBook.initialize
    const orderBookReader = await deployContract(deploy, deployer, "OrderBookReader", []);
    //TODO: add position router and position manager
    await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
    await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
    await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")
    //const glp = await deploy("GLP", { from: deployer });
    const glp = await deployContract(deploy, deployer, "GLP", []);
    await sendTxn(glp.setInPrivateTransferMode(true), "glp.setInPrivateTransferMode")
    //const glpManager = await deploy("GLPManager", { from: deployer, args: [vault.address, usdg.address, glp.address, glp.address, 15 * 60] });
    const glpManager = await deployContract(deploy, deployer, "GlpManager", [vault.address, usdg.address, glp.address, glp.address, 15 * 60]);
    await sendTxn(glpManager.setInPrivateMode(true), "glpManager.setInPrivateMode")

    await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
    await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault(glpManager)")

    await sendTxn(vault.initialize(
        router.address, // router
        usdg.address, // usdg
        vaultPriceFeed.address, // priceFeed
        toUsd(2), // liquidationFeeUsd
        100, // fundingRateFactor
        100 // stableFundingRateFactor
    ), "vault.initialize")

    await sendTxn(vault.setFundingRate(60 * 60, 100, 100), "vault.setFundingRate")

    await sendTxn(vault.setInManagerMode(true), "vault.setInManagerMode")
    await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")

    await sendTxn(vault.setFees(
        10, // _taxBasisPoints
        5, // _stableTaxBasisPoints
        20, // _mintBurnFeeBasisPoints
        20, // _swapFeeBasisPoints
        1, // _stableSwapFeeBasisPoints
        10, // _marginFeeBasisPoints
        toUsd(2), // _liquidationFeeUsd
        24 * 60 * 60, // _minProfitTime
        true // _hasDynamicFees
    ), "vault.setFees")
    //const vaultErrorController = await deploy("VaultErrorController", { from: deployer });
    const vaultErrorController = await deployContract(deploy, deployer, "VaultErrorController", []);
    await sendTxn(vault.setErrorController(vaultErrorController.address), "vault.setErrorController")
    await sendTxn(vaultErrorController.setErrors(vault.address, errors), "vaultErrorController.setErrors")
    const vaultUtils = await deploy("VaultUtils", { from: deployer, args: [vault.address] });
    await sendTxn(vault.setVaultUtils(vaultUtils.address), "vault.setVaultUtils")

}

async function deployContract(deploy, deployer, contractName, args) {
    const contract = await deploy(contractName, { from: deployer, args: args });
    console.log(contractName + " deployed to:", contract.address);
    const contractFactory = await ethers.getContractFactory(contractName);
    const contractInstance = await contractFactory.attach(contract.address);
    return contractInstance;
}


async function sendTxn(txnPromise, label) {
    const txn = await txnPromise
    console.info(`Sending ${label}...`)
    await txn.wait()
    console.info(`... Sent! ${txn.hash}`)
    await sleep(2000)
    return txn
}

function expandDecimals(n, decimals) {
    return bigNumberify(n).mul(bigNumberify(10).pow(decimals))
}

function bigNumberify(n) {
    return ethers.BigNumber.from(n)
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toUsd(value) {
    const normalizedValue = parseInt(value * Math.pow(10, 10))
    return ethers.BigNumber.from(normalizedValue).mul(ethers.BigNumber.from(10).pow(20))
}
