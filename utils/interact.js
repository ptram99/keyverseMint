const { createAlchemyWeb3 } = require('@alch/alchemy-web3')
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
const whitelist = require('../scripts/whitelist.js')
const OG = require('../scripts/OG.js')

const web3 = createAlchemyWeb3(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL)
import { config } from '../dapp.config'

const contractAbi = require('../contracts/abi.json')
const nftContract = new web3.eth.Contract(contractAbi, config.contractAddress)

const leafNodes = whitelist.map((addr) => keccak256(addr))
const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true })
const root = merkleTree.getRoot()

const leafNodesOG = OG.map((addr) => keccak256(addr))
const merkleTreeOG = new MerkleTree(leafNodesOG, keccak256, { sortPairs: true })
const rootOG = merkleTreeOG.getRoot()

export const getTotalMinted = async () => {
  const totalMinted = await nftContract.methods.totalSupply().call()
  return totalMinted
}

export const getMaxSupply = async () => {
  const maxSupply = await nftContract.methods.maxSupply().call()
  return maxSupply
}

export const isPausedState = async () => {
  const paused = await nftContract.methods.isPaused().call()
  return paused
}

export const isPublicSaleState = async () => {
  const publicSale = (await nftContract.methods.mintState().call() == 2)
  return publicSale
}

export const isPreSaleState = async () => {
  const preSale = (await nftContract.methods.mintState().call() != 2)
  return preSale
}

// Util function for checking requirements
const isAllowedToMint = async(cost, mintAmount, mintState) => {
  const userBalance = await web3.eth.getBalance(window.ethereum.selectedAddress)
  if (userBalance < mintAmount * cost) {
    return {
      success: false,
      status: "Insufficient funds"
    }
  }

  let maxAmount = mintState == 2 ? config.publicLimit : config.whitelistLimit;
  console.log(maxAmount)
  const tokenBalance = await nftContract.methods.balanceOf(window.ethereum.selectedAddress).call()
  console.log(tokenBalance)
  if (tokenBalance + mintAmount > maxAmount) {
    return {
      success: false,
      status: "Mint limit exceeded"
    }
  }

  return {
    success: true
  }
}

export const presaleMint = async (mintAmount) => {
  if (!window.ethereum.selectedAddress) {
    return {
      success: false,
      status: 'To be able to mint, you need to connect your wallet'
    }
  }

  const isMintPaused = await isPausedState()
  if (isMintPaused) {
    return {
      success: false,
      status: 'Minting is paused'
    }
  }

  const mintState = 1
  const mintPrice = web3.utils.toWei(String(config.price), 'ether')

  const leaf = keccak256(window.ethereum.selectedAddress)
  let proof = 0
  if (mintState == 1)
  {
    proof = merkleTree.getHexProof(leaf)
    const isValid = merkleTree.verify(proof, leaf, root)
    if (!isValid) {
      return {
        success: false,
        status: 'You are not on the KeyList'
      }
    }
  } else {
    proof = merkleTreeOG.getHexProof(leaf)
    const isValid = merkleTreeOG.verify(proof, leaf, rootOG)
    if (!isValid) {
      return {
        success: false,
        status: 'You are not on the MasterKey'
      }
    }
  }

  const mintRequirements = await isAllowedToMint(mintPrice, mintAmount, mintState)
  if (mintRequirements.success == false) {
    return {
      success: false,
      status: mintRequirements.status
    }
  }

  const mintedAmount = await getTotalMinted()
  if (mintedAmount > 5000) {
    return {
      success: false,
      status: 'Pre-Sale supply is sold out'
    }
  }

  const nonce = await web3.eth.getTransactionCount(
    window.ethereum.selectedAddress,
    'latest'
  )

  const tx = {
    to: config.contractAddress,
    from: window.ethereum.selectedAddress,
    value: parseInt(
      String(mintPrice * mintAmount)
    ).toString(16), // hex
    data: nftContract.methods
      .presaleMint(mintAmount, proof)
      .encodeABI(),
    nonce: nonce.toString(16)
  }

  try {
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [tx]
    })

    return {
      success: true,
      status: (
        <a href={`https://etherscan.io/tx/${txHash}`} target="_blank">
          <p>✅ Check out your transaction on Etherscan:</p>
          <p>{`https://etherscan.io/tx/${txHash}`}</p>
        </a>
      )
    }
  } catch (error) {
    return {
      success: false,
      status: '😞 Smth went wrong:' + error.message
    }
  }
}

export const publicMint = async (mintAmount) => {
  if (!window.ethereum.selectedAddress) {
    return {
      success: false,
      status: 'To be able to mint, you need to connect your wallet'
    }
  }

  const isMintPaused = await isPausedState()
  if (isMintPaused) {
    return {
      success: false,
      status: 'Minting is paused'
    }
  }

  const mintState = 2
  const mintPrice = web3.utils.toWei(String(config.price), 'ether')
  const { mintReqSuccess, mintReqStatus } = await isAllowedToMint(mintPrice, mintAmount, mintState)
  if (mintReqSuccess == false) {
    return {
      success: false,
      status: mintReqStatus
    }
  }

  const nonce = await web3.eth.getTransactionCount(
    window.ethereum.selectedAddress,
    'latest'
  )

  // Set up our Ethereum transaction
  const tx = {
    to: config.contractAddress,
    from: window.ethereum.selectedAddress,
    value: parseInt(
      String(mintPrice * mintAmount)
    ).toString(16), // hex
    data: nftContract.methods.publicMint(mintAmount).encodeABI(),
    nonce: nonce.toString(16)
  }

  try {
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [tx]
    })

    return {
      success: true,
      status: (
        <a href={`https://etherscan.io/tx/${txHash}`} target="_blank">
          <p>✅ Check out your transaction on Etherscan:</p>
          <p>{`https://etherscan.io/tx/${txHash}`}</p>
        </a>
      )
    }
  } catch (error) {
    return {
      success: false,
      status: '😞 Smth went wrong:' + error.message
    }
  }
}

export const getMintState = async() => {
  const mintState = await nftContract.methods.mintState().call()
  return mintState
}

export const getMintPriceFromState = async (mintState) => {
  let ret = 0
  if (mintState == 0) {
    ret = await nftContract.methods.ogCost().call()
  } else {
    ret = await nftContract.methods.cost().call()
  }
  return ret
}

export const getMintLimitFromState = async (mintState) => {
  let ret = 0
  if (mintState == 0) {
    ret = await nftContract.methods.ogLimit().call()
  } else if (mintState == 1) {
    ret = await nftContract.methods.whitelistLimit().call()
  } else {
    ret = await nftContract.methods.publicLimit().call()
  }
  return ret
}
export const getMintAmount = async () => {
  const mintState = await nftContract.methods.mintState().call()
  let ret = 0
  if (mintState == 0) {
    ret = await nftContract.methods.ogLimit().call()
  } else if (mintState == 1) {
    ret = await nftContract.methods.whitelistLimit().call()
  } else {
    ret = await nftContract.methods.publicLimit().call()
  }
  return ret
}

export const getMintPrice = async () => {
  const mintState = await nftContract.methods.mintState().call()
  let ret = 0
  if (mintState == 0) {
    ret = await nftContract.methods.ogCost().call()
  } else {
    ret = await nftContract.methods.cost().call()
  }
  return ret
}
