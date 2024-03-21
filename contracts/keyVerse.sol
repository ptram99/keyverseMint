//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract KeyVerse is ERC721, Ownable {
    using Strings for uint256;
    using Counters for Counters.Counter;
    Counters.Counter private tokenIds;

    uint256 public cost = 0.0001 ether;
    uint256 public ogCost = 0.0002 ether;
    uint256 public constant maxSupply = 5555;
    uint256 public whitelistLimit = 2;
    uint256 public ogLimit = 2;
    uint256 public publicLimit = 1;
    uint256 private mintedAmount = 0;
    uint256[5555] private tokenLevels;

    enum MintState{OG, WHITELIST, PUBLIC}
    MintState public mintState = MintState.OG;
 
    bool hidden = true;
    bool paused = false;

    bytes32 merkleRootWhitelist;
    bytes32 merkleRootOG;

    address stakeAddr;

    string private hiddenUri = "hidden ipfs";
    string[21] levelToUri;

    constructor()
    ERC721("KeyVerse", "KV")
    {
    }
    
    function upgradeLevel(uint256 _tokenId) external {
        require(!hidden);
        require(!paused);
        require(msg.sender == stakeAddr || msg.sender == owner());
        uint256 level = getLevel(_tokenId);
        if(level < 20) {
            tokenLevels[_tokenId] += 1;
        }
    }

    function getLevel(uint256 _tokenId) public view returns (uint256) {
        require(_exists(_tokenId), "Nonexistent token");
        return tokenLevels[_tokenId];
    }
       
    function _burn(uint256 tokenId)
        internal
        override(ERC721)
        onlyOwner
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 _id)
        public
        view
        override(ERC721)
        returns (string memory)
    {
        require(_exists(_id), "Nonexistent token");
        if (hidden) {
            return string(
                abi.encodePacked(
                    hiddenUri,
                    _id.toString(),
                    ".json"
                ));
        }
        return string(
            abi.encodePacked(
                levelToUri[tokenLevels[_id]],
                _id.toString(),
                ".json"
            ));
    }
    
    function internalMint(uint256 _mintAmount) internal {
        uint256 currentId = tokenIds.current();
        for (uint256 i = 0; i < _mintAmount; i++) {
            _safeMint(msg.sender, currentId + i);
            tokenLevels[currentId + i] = 0;
            tokenIds.increment();
        }
    }

    function presaleMint(uint256 _mintAmount, bytes32[] calldata _merkleProof) external payable {
        require(!paused, "Contract is paused");
        require(mintState == MintState.WHITELIST || mintState == MintState.OG, "Presale not active");
        require(_mintAmount > 0, "Mint at least 1");
        require(tokenIds.current() + _mintAmount <= maxSupply, "Sold out!");
        if (msg.sender != owner()) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            if (mintState == MintState.OG) {
                require(balanceOf(msg.sender) + _mintAmount <= ogLimit, "Max per address exceeded");
                require(msg.value >= ogCost * _mintAmount, "Insufficient funds");
                require(MerkleProof.verify(_merkleProof, merkleRootOG, leaf), "Invalid proof");
            } else {
                require(balanceOf(msg.sender) + _mintAmount <= whitelistLimit, "Max per address exceeded");
                require(msg.value >= cost * _mintAmount, "Insufficient funds");
                require(MerkleProof.verify(_merkleProof, merkleRootWhitelist, leaf), "Invalid proof");
            }
        }
        internalMint(_mintAmount);
        if (mintState == MintState.WHITELIST) {
            mintedAmount = mintedAmount + _mintAmount;
            if (mintedAmount == 1000) {
                cost = cost + 0.05 ether;
                mintedAmount = 0;
            }
        }
    }

    function publicMint(uint256 _mintAmount) external payable {
        require(!paused, "Contract is paused");
        require(mintState == MintState.PUBLIC, "Public mint is not active");
        require(_mintAmount > 0, "Mint 1 NFT");
        uint256 supply = tokenIds.current();
        require(supply + _mintAmount <= maxSupply, "Sold out!");

        if (msg.sender != owner()) {
            require(balanceOf(msg.sender) + _mintAmount <= publicLimit, "Max per address exceeded");
            require(_mintAmount <= publicLimit, "Max per address exceeded");
            require(msg.value >= cost * _mintAmount, "Insufficient funds");
        }

        internalMint(_mintAmount);
        mintedAmount = mintedAmount + _mintAmount;
        if (mintedAmount == 1000) {
            cost = cost + 0.05 ether;
            mintedAmount = 0;
        }
    }

    function totalSupply() public view returns (uint256) {
        return tokenIds.current();
    }

    function isPaused() external view returns (bool) {
        return paused;
    }

    function setRevealed(bool _state) external onlyOwner {
        hidden = !_state;
    }

    function setMintState(MintState _state) external onlyOwner {
        mintState = _state;
    }

    function pause(bool _state) external onlyOwner {
        paused = _state;
    }

    function setWhitelistRoot(bytes32 _root) external onlyOwner {
        merkleRootWhitelist = _root;
    }

    function setOGRoot(bytes32 _root) external onlyOwner {
        merkleRootOG = _root;  
    }

    function setStakingAddr(address _addr) external onlyOwner {
        stakeAddr = _addr;
    }

    function getBalance() external view onlyOwner returns (uint256) {
        return address(this).balance;
    }

    function setURIs(string[] calldata _URIs) external onlyOwner {
        require(_URIs.length == 21);
        for (uint256 i = 0; i < 21; ++i) {
            levelToUri[i] = _URIs[i];
        }
    }

    function setWhitelistMint() external onlyOwner {
        mintState = MintState.WHITELIST;
    }

    function setOGMint() external onlyOwner {
        mintState = MintState.OG;
    }

    function setPublicMint() external onlyOwner {
        mintState = MintState.PUBLIC;
    }

    function withdraw() external payable onlyOwner {
        (bool os, ) = payable(owner()).call{value: address(this).balance}("");
        require(os);
    }
}
